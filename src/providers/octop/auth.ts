import { requestUrl } from "obsidian";
import {
	credentialsFingerprint,
	getResponseHeader,
	normalizeOctopBaseUrl,
	parseOctopBaseUrl,
	classifyOctopHttpError,
} from "./helpers";
import {
	OCTOP_RENEW_HEADER,
	OCTOP_REQUEST_TIMEOUT_MS,
	OCTOP_SOFT_EXPIRY_SKEW_MS,
	OctopAuthEntry,
	OctopErrorCode,
	OctopLoginResponse,
	OctopProviderConfig,
} from "./types";

export class OctopAuthError extends Error {
	constructor(readonly code: OctopErrorCode) {
		super(code);
		this.name = "OctopAuthError";
	}
}

export interface OctopAuthHost {
	getAuthEntry(configId: string): OctopAuthEntry | undefined;
	/** Merge patch into octopAuth[configId] and persist via save queue. */
	updateAuthEntry(configId: string, patch: OctopAuthEntry | null): Promise<void>;
	getConfig(configId: string): OctopProviderConfig | undefined;
}

type RequestResult = {
	status: number;
	json: unknown;
	headers: Record<string, string>;
};

/**
 * Seamless JWT auth for Octop: login, soft-expiry, sliding renew (best-effort),
 * single-flight, credential breaker, batch negative-cache for unreachable.
 */
export class OctopAuthSession {
	private readonly inFlight = new Map<string, Promise<string>>();
	private readonly batchNegative = new Map<string, OctopErrorCode>();

	constructor(private readonly host: OctopAuthHost) {}

	/** Call at the start of a multi-file export for a config. */
	beginBatch(configId: string): void {
		this.batchNegative.delete(configId);
	}

	clearBreaker(configId: string): Promise<void> {
		const cur = this.host.getAuthEntry(configId) ?? {};
		return this.host.updateAuthEntry(configId, { ...cur, authFailed: false });
	}

	async ensureAccessToken(config: OctopProviderConfig, opts?: { forceLogin?: boolean }): Promise<string> {
		const base = normalizeOctopBaseUrl(config.baseUrl ?? "");
		const username = config.username?.trim() ?? "";
		// Trim to match credentialsFingerprint hashing — a trailing space in the
		// settings field must not login with a different secret than the fingerprint.
		const password = (config.password ?? "").trim();
		if (!parseOctopBaseUrl(base) || !username || !password) {
			throw new OctopAuthError("incomplete");
		}

		const neg = this.batchNegative.get(config.id);
		if (neg) throw new OctopAuthError(neg);

		const fp = await credentialsFingerprint(base, username, password);
		let entry = { ...(this.host.getAuthEntry(config.id) ?? {}) };

		if (entry.credentialsFingerprint && entry.credentialsFingerprint !== fp) {
			entry = {};
			await this.host.updateAuthEntry(config.id, null);
		} else if (!entry.credentialsFingerprint && (entry.accessToken || entry.authFailed)) {
			entry = {};
			await this.host.updateAuthEntry(config.id, null);
		}

		if (entry.authFailed && entry.credentialsFingerprint === fp && !opts?.forceLogin) {
			throw new OctopAuthError("authFailed");
		}

		const softOk =
			!opts?.forceLogin &&
			!!entry.accessToken &&
			entry.credentialsFingerprint === fp &&
			typeof entry.accessTokenExpiresAt === "number" &&
			Number.isFinite(entry.accessTokenExpiresAt) &&
			entry.accessTokenExpiresAt > Date.now() + OCTOP_SOFT_EXPIRY_SKEW_MS;

		if (softOk && entry.accessToken) return entry.accessToken;

		const flightKey = `${config.id}:${fp}`;
		const existing = this.inFlight.get(flightKey);
		if (existing) return existing;

		const loginPromise = this.loginAndStore(config, base, username, password, fp);
		this.inFlight.set(flightKey, loginPromise);
		try {
			return await loginPromise;
		} finally {
			this.inFlight.delete(flightKey);
		}
	}

	async authorizedRequest(
		config: OctopProviderConfig,
		url: string,
		init: { method?: string; body?: string; route?: "login" | "capability" | "listKbs" | "document" },
	): Promise<RequestResult> {
		let token = await this.ensureAccessToken(config);
		let result = await this.rawRequest(url, {
			method: init.method,
			body: init.body,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});

		await this.maybeAdoptRenew(config, result.headers);

		if (result.status === 401) {
			token = await this.ensureAccessToken(config, { forceLogin: true });
			result = await this.rawRequest(url, {
				method: init.method,
				body: init.body,
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});
			await this.maybeAdoptRenew(config, result.headers);
			if (result.status === 401) {
				const cur = this.host.getAuthEntry(config.id) ?? {};
				const fp = await credentialsFingerprint(
					normalizeOctopBaseUrl(config.baseUrl ?? ""),
					config.username?.trim() ?? "",
					(config.password ?? "").trim(),
				);
				await this.host.updateAuthEntry(config.id, {
					...cur,
					accessToken: undefined,
					authFailed: true,
					credentialsFingerprint: fp,
				});
				this.batchNegative.set(config.id, "authFailed");
				throw new OctopAuthError("authFailed");
			}
		}

		return result;
	}

	private async loginAndStore(
		config: OctopProviderConfig,
		base: string,
		username: string,
		password: string,
		fp: string,
	): Promise<string> {
		let result: RequestResult;
		try {
			result = await this.rawRequest(`${base}/auth/login`, {
				method: "POST",
				body: JSON.stringify({ username, password }),
				headers: { "Content-Type": "application/json" },
			});
		} catch (err) {
			if (err instanceof OctopAuthError) {
				if (err.code === "unreachable" || err.code === "timeout") {
					this.batchNegative.set(config.id, err.code);
				}
				throw err;
			}
			this.batchNegative.set(config.id, "unreachable");
			throw new OctopAuthError("unreachable");
		}

		if (result.status < 200 || result.status >= 300) {
			const code = classifyOctopHttpError(result.status, result.json, "login");
			if (code === "authFailed") {
				await this.host.updateAuthEntry(config.id, {
					authFailed: true,
					credentialsFingerprint: fp,
				});
			} else if (code === "unreachable" || code === "timeout" || code === "serverError") {
				const mapped = code === "serverError" ? "unreachable" : code;
				this.batchNegative.set(config.id, mapped === "unreachable" || mapped === "timeout" ? mapped : "unreachable");
			}
			throw new OctopAuthError(code === "serverError" ? "unreachable" : code);
		}

		// Discard if credentials changed mid-flight or config was deleted.
		const live = this.host.getConfig(config.id);
		if (!live) throw new OctopAuthError("incomplete");
		const liveFp = await credentialsFingerprint(
			normalizeOctopBaseUrl(live.baseUrl ?? ""),
			live.username?.trim() ?? "",
			live.password ?? "",
		);
		if (liveFp !== fp) throw new OctopAuthError("authFailed");

		const body = (result.json ?? {}) as OctopLoginResponse;
		const token = body.access_token?.trim();
		if (!token) throw new OctopAuthError("authFailed");

		const expiresInSec = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 86400;
		const lastKnownExpiresInMs = expiresInSec * 1000;
		await this.host.updateAuthEntry(config.id, {
			accessToken: token,
			accessTokenExpiresAt: Date.now() + lastKnownExpiresInMs,
			lastKnownExpiresInMs,
			authFailed: false,
			credentialsFingerprint: fp,
		});
		return token;
	}

	private async maybeAdoptRenew(
		config: OctopProviderConfig,
		headers: Record<string, string>,
	): Promise<void> {
		const renewed = getResponseHeader(headers, OCTOP_RENEW_HEADER);
		if (!renewed) return;
		const cur = this.host.getAuthEntry(config.id) ?? {};
		const ttl = cur.lastKnownExpiresInMs;
		if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0) return;
		if (cur.accessToken === renewed) return;
		await this.host.updateAuthEntry(config.id, {
			...cur,
			accessToken: renewed,
			accessTokenExpiresAt: Date.now() + ttl,
		});
	}

	private async rawRequest(
		url: string,
		init: { method?: string; body?: string; headers?: Record<string, string> },
	): Promise<RequestResult> {
		const work = (async (): Promise<RequestResult> => {
			try {
				const response = await requestUrl({
					url,
					method: init.method ?? "GET",
					headers: init.headers,
					body: init.body,
					throw: false,
				});
				return {
					status: response.status,
					json: parseRequestJson(response),
					headers: response.headers ?? {},
				};
			} catch {
				throw new OctopAuthError("unreachable");
			}
		})();

		let settled = false;
		const markSettled = (): void => {
			settled = true;
		};
		const timeout = new Promise<never>((_, reject) => {
			window.setTimeout(() => {
				if (!settled) reject(new OctopAuthError("timeout"));
			}, OCTOP_REQUEST_TIMEOUT_MS);
		});

		try {
			const result = await Promise.race([work.finally(markSettled), timeout]);
			void work.then(() => undefined, () => undefined); // ignore late
			return result;
		} catch (err) {
			markSettled();
			void work.then(() => undefined, () => undefined);
			throw err;
		}
	}
}

/** Prefer response.json; fall back to parsing response.text when the getter fails. */
function parseRequestJson(response: { json?: unknown; text?: string }): unknown {
	try {
		const direct = response.json;
		if (direct !== undefined && direct !== null) return direct;
	} catch {
		// fall through to text
	}
	const text = typeof response.text === "string" ? response.text.trim() : "";
	if (!text) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}
