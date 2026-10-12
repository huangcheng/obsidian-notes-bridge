import { t } from "../../i18n";
import {
	FetchOptions,
	ListOptions,
	NormalizedNote,
	Provider,
	ProviderAvailability,
	ProviderCapabilities,
	RemoteListItem,
} from "../provider";
import { ProviderFactory } from "../registry";
import { OctopAuthError, OctopAuthSession } from "./auth";
import {
	classifyOctopHttpError,
	extractDocumentId,
	extractOctopDetails,
	isCleartextNonLoopback,
	normalizeOctopBaseUrl,
	parseOctopBaseUrl,
	sanitizeOctopDocumentName,
} from "./helpers";
import {
	OctopCapability,
	OctopErrorCode,
	OctopKnowledgeBase,
	OctopProviderConfig,
} from "./types";

/**
 * Push-only Octop knowledge-base provider. Auth is seamless JWT via
 * {@link OctopAuthSession}; notes are created with documents/text.
 */
export class OctopProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "database";
	readonly capabilities: ProviderCapabilities = {
		canImport: false,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	constructor(
		private readonly config: OctopProviderConfig,
		private readonly auth: OctopAuthSession,
	) {
		this.id = config.id;
		this.displayName = config.displayName || t("brands.octop");
	}

	available(): ProviderAvailability {
		if (
			!parseOctopBaseUrl(this.config.baseUrl ?? "") ||
			!this.config.username?.trim() ||
			!(this.config.password ?? "").trim() ||
			!this.config.knowledgeBaseId?.trim()
		) {
			return { ok: false, reason: t("providers.octopIncompleteConfig") };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		try {
			const { base, kbId } = this.requirePushConfig();
			const name = sanitizeOctopDocumentName(note.title);
			const result = await this.auth.authorizedRequest(
				this.config,
				`${base}/knowledge-bases/${encodeURIComponent(kbId)}/documents/text`,
				{
					method: "POST",
					body: JSON.stringify({ name, format: "md", content: note.body }),
					route: "document",
				},
			);

			if (result.status < 200 || result.status >= 300) {
				throw new Error(
					this.messageFor(classifyOctopHttpError(result.status, result.json, "document"), result.json),
				);
			}

			const remoteId = extractDocumentId(result.json);
			if (!remoteId) throw new Error(t("providers.octopCreateFailed"));
			return { remoteId };
		} catch (err) {
			if (err instanceof OctopAuthError && err.code === "timeout") {
				throw new Error(t("providers.octopTimeoutMaybeSent"));
			}
			throw new Error(messageFromOctopError(err));
		}
	}

	async fetch(_remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		throw new Error(t("providers.octopReadUnsupported"));
	}

	async listRemote(_opts?: ListOptions): Promise<RemoteListItem[]> {
		throw new Error(t("providers.octopReadUnsupported"));
	}

	async listKnowledgeBases(): Promise<OctopKnowledgeBase[]> {
		try {
			const base = this.requireConnectionBase();
			const result = await this.auth.authorizedRequest(this.config, `${base}/knowledge-bases`, {
				route: "listKbs",
			});
			if (result.status < 200 || result.status >= 300) {
				throw new Error(
					this.messageFor(classifyOctopHttpError(result.status, result.json, "listKbs"), result.json),
				);
			}
			const data = result.json;
			if (!Array.isArray(data)) return [];
			return data as OctopKnowledgeBase[];
		} catch (err) {
			throw new Error(messageFromOctopError(err));
		}
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			await this.auth.clearBreaker(this.config.id);
			this.auth.beginBatch(this.config.id);
			const base = this.requireConnectionBase();
			const capRes = await this.auth.authorizedRequest(
				this.config,
				`${base}/knowledge-bases/capability`,
				{ route: "capability" },
			);
			if (capRes.status < 200 || capRes.status >= 300) {
				throw new Error(
					this.messageFor(classifyOctopHttpError(capRes.status, capRes.json, "capability"), capRes.json),
				);
			}
			const cap = (capRes.json ?? {}) as OctopCapability;
			if (cap.usable === false) {
				throw new Error(t("providers.octopCapabilityUnavailable"));
			}
			if (cap.prerequisites_ok === false) {
				throw new Error(t("providers.octopPrerequisitesFailed"));
			}
			const kbs = await this.listKnowledgeBases();
			const warn = isCleartextNonLoopback(this.config.baseUrl ?? "")
				? ` — ${t("providers.octopCleartextWarning")}`
				: "";
			return {
				ok: true,
				message: t("providers.octopTestSuccess", { count: kbs.length }) + warn,
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	beginExportBatch(): void {
		this.auth.beginBatch(this.config.id);
	}

	dispose(): void {
		// No long-lived sockets.
	}

	private requireConnectionBase(): string {
		const base = normalizeOctopBaseUrl(this.config.baseUrl ?? "");
		if (
			!parseOctopBaseUrl(base) ||
			!this.config.username?.trim() ||
			!(this.config.password ?? "").trim()
		) {
			throw new Error(t("providers.octopIncompleteConfig"));
		}
		return base;
	}

	private requirePushConfig(): { base: string; kbId: string } {
		const base = this.requireConnectionBase();
		const kbId = this.config.knowledgeBaseId?.trim() ?? "";
		if (!kbId) throw new Error(t("providers.octopIncompleteConfig"));
		return { base, kbId };
	}

	private messageFor(code: OctopErrorCode, body: unknown): string {
		if (code === "prerequisites") {
			const details = extractOctopDetails(body);
			const base = t("providers.octopPrerequisitesFailed");
			return details ? `${base} ${details}` : base;
		}
		const key = CODE_TO_I18N[code];
		return t(key);
	}
}

const CODE_TO_I18N: Record<OctopErrorCode, Parameters<typeof t>[0]> = {
	incomplete: "providers.octopIncompleteConfig",
	authFailed: "providers.octopAuthFailed",
	unreachable: "providers.octopUnreachable",
	timeout: "providers.octopTimeout",
	forbidden: "providers.octopForbidden",
	notFound: "providers.octopNotFound",
	wrongBaseUrl: "providers.octopWrongBaseUrl",
	prerequisites: "providers.octopPrerequisitesFailed",
	capabilityUnavailable: "providers.octopCapabilityUnavailable",
	conflict: "providers.octopConflict",
	tooLarge: "providers.octopTooLarge",
	validation: "providers.octopValidationFailed",
	rateLimited: "providers.octopRateLimited",
	serverError: "providers.octopServerError",
	createFailed: "providers.octopCreateFailed",
};

export function createOctopFactory(auth: OctopAuthSession): ProviderFactory<OctopProviderConfig> {
	return {
		kind: "octop",
		create(config) {
			return new OctopProvider(config, auth);
		},
	};
}

/** Map auth/provider errors thrown as OctopAuthError into i18n messages. */
export function messageFromOctopError(err: unknown): string {
	if (err instanceof OctopAuthError) {
		const key = CODE_TO_I18N[err.code];
		return t(key);
	}
	if (err instanceof Error) return err.message;
	return String(err);
}
