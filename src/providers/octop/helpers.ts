import { OctopErrorCode } from "./types";

/**
 * Normalize a user-entered Octop API base: trim and strip trailing slashes.
 * Does not append `/api` — the user must paste the full API base.
 */
export function normalizeOctopBaseUrl(raw: string): string {
	return raw.trim().replace(/\/+$/, "");
}

/** Reject non-http(s) schemes. Returns null when invalid/empty. */
export function parseOctopBaseUrl(raw: string): URL | null {
	const normalized = normalizeOctopBaseUrl(raw);
	if (!normalized) return null;
	try {
		const url = new URL(normalized);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url;
	} catch {
		return null;
	}
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True when URL is http to a non-loopback host (cleartext LAN / WAN risk). */
export function isCleartextNonLoopback(raw: string): boolean {
	const url = parseOctopBaseUrl(raw);
	if (!url || url.protocol !== "http:") return false;
	return !LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
}

export function sanitizeOctopDocumentName(title: string): string {
	let stripped = title.replace(/[/\\]/g, "");
	stripped = [...stripped].filter((ch) => {
		const code = ch.charCodeAt(0);
		return code >= 32 && code !== 127;
	}).join("");
	const stem = stripped.trim().slice(0, 200);
	return stem || "untitled";
}

interface OctopErrorEnvelope {
	error?: { code?: string; message?: string; details?: unknown };
	detail?: unknown;
	code?: string;
}

function asEnvelope(body: unknown): OctopErrorEnvelope | null {
	if (!body || typeof body !== "object") return null;
	return body as OctopErrorEnvelope;
}

function extractErrorCode(body: unknown): string | undefined {
	const env = asEnvelope(body);
	if (!env) return undefined;
	if (typeof env.error?.code === "string") return env.error.code;
	if (typeof env.code === "string") return env.code;
	return undefined;
}

/**
 * Map HTTP status + body to a stable error code.
 * Parse order: error.code → status (+ route context) → generic.
 */
export function classifyOctopHttpError(
	status: number,
	body: unknown,
	route: "login" | "capability" | "listKbs" | "document" = "document",
): OctopErrorCode {
	const code = extractErrorCode(body);
	if (code === "AUTH_FAILED") return "authFailed";
	if (code === "KNOWLEDGE_PREREQUISITES_FAILED") return "prerequisites";

	if (status === 401) return "authFailed";
	if (status === 403) return "forbidden";
	if (status === 404) {
		if (route === "login" || route === "capability" || route === "listKbs") return "wrongBaseUrl";
		return "notFound";
	}
	if (status === 409) return code === "KNOWLEDGE_PREREQUISITES_FAILED" ? "prerequisites" : "conflict";
	if (status === 413) return "tooLarge";
	if (status === 422) return "validation";
	if (status === 429) return "rateLimited";
	if (status >= 500) return "serverError";
	return "createFailed";
}

/** Truncate/sanitize server details for Notice append (prerequisites only). */
export function sanitizeOctopDetails(details: unknown, maxLen = 200): string {
	let text: string;
	if (details == null) text = "";
	else if (typeof details === "string") text = details;
	else if (typeof details === "number" || typeof details === "boolean" || typeof details === "bigint") {
		text = String(details);
	} else {
		try {
			text = JSON.stringify(details);
		} catch {
			text = "";
		}
	}
	text = [...text]
		.map((ch) => {
			const code = ch.charCodeAt(0);
			return code < 32 || code === 127 ? " " : ch;
		})
		.join("")
		.trim();
	if (text.length > maxLen) text = `${text.slice(0, maxLen)}…`;
	return text;
}

export function extractOctopDetails(body: unknown): string {
	const env = asEnvelope(body);
	if (!env) return "";
	if (env.error?.details != null) return sanitizeOctopDetails(env.error.details);
	if (typeof env.error?.message === "string") return sanitizeOctopDetails(env.error.message);
	return "";
}

/** Pull document id from a create response (top-level or nested under data). */
export function extractDocumentId(body: unknown): string {
	if (!body || typeof body !== "object") return "";
	const doc = body as {
		id?: unknown;
		document_id?: unknown;
		data?: { id?: unknown; document_id?: unknown };
	};
	const nested = doc.data;
	const id = doc.id ?? doc.document_id ?? nested?.id ?? nested?.document_id ?? "";
	return typeof id === "string" ? id.trim() : "";
}

export async function credentialsFingerprint(
	baseUrl: string,
	username: string,
	password: string,
): Promise<string> {
	const payload =
		JSON.stringify({ baseUrl: baseUrl.trim(), username: username.trim() }) + "\0" + password.trim();
	const data = new TextEncoder().encode(payload);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Case-insensitive header lookup on Obsidian requestUrl response headers. */
export function getResponseHeader(
	headers: Record<string, string> | undefined,
	name: string,
): string | undefined {
	if (!headers) return undefined;
	const want = name.toLowerCase();
	for (const [k, v] of Object.entries(headers)) {
		if (k.toLowerCase() === want && typeof v === "string" && v.trim()) return v.trim();
	}
	return undefined;
}
