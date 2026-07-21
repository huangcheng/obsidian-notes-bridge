/**
 * Normalize a user-entered WeKnora API base URL: trim surrounding
 * whitespace and strip trailing slashes. The user pastes the full base
 * including `/api/v1` (same string the browser extension asks for), so
 * we do not append or rewrite the path — only tidy it.
 */
export function normalizeWeknoraBaseUrl(raw: string): string {
	return raw.trim().replace(/\/+$/, "");
}

/**
 * Map a WeKnora HTTP failure (status + parsed/unknown body) to a
 * concrete user-facing message. The body is currently unused because
 * WeKnora's status codes are authoritative, but it is accepted so the
 * provider can forward richer errors later without changing call sites.
 */
export function describeWeknoraHttpError(status: number, _body: unknown): string {
	switch (status) {
		case 401:
			return "WeKnora rejected the API key.";
		case 403:
			return "API key lacks permission (needs full access or the ingest capability, and access to this knowledge base).";
		case 404:
			return "Knowledge base not found.";
		case 409:
			return "Document already exists in this knowledge base.";
		case 413:
			return "Note is too large for the WeKnora server limit.";
		case 429:
			return "WeKnora rate-limited the request.";
		default:
			if (status >= 500) return `WeKnora server error (status ${status}).`;
			return `WeKnora request failed (status ${status}).`;
	}
}
