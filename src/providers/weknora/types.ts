import { ProviderConfigBase } from "../registry";

/**
 * WeKnora provider configuration. Mirrors the browser extension's
 * "enterprise/developer mode" connection: a full API base URL plus a
 * long-lived API key. The target knowledge base ("wiki folder") is
 * chosen once in settings.
 */
export interface WeknoraProviderConfig extends ProviderConfigBase {
	kind: "weknora";
	/** Full API base, e.g. http://localhost:8080/api/v1 */
	baseUrl?: string;
	/** Long-lived API key (X-API-Key). Created in WeKnora web UI → Settings → Integrations → API. */
	apiKey?: string;
	/** Default knowledge base id for exports. */
	knowledgeBaseId?: string;
	/** Default knowledge base display name (kept for a readable settings card when offline). */
	knowledgeBaseName?: string;
}

export const DEFAULT_WEKNORA_CONFIG: Omit<WeknoraProviderConfig, "id" | "displayName"> = {
	kind: "weknora",
	enabled: true,
};

/** Path suffix every WeKnora server exposes. The base URL already includes it. */
export const WEKNORA_API_PATH = "/api/v1";

/** Label sent with each ingest so WeKnora analytics can attribute the source. */
export const WEKNORA_CHANNEL = "obsidian";

/** Where to send users to create an API key. */
export const WEKNORA_TOKEN_HELP_URL = "https://github.com/Tencent/WeKnora";

/** GET /knowledge-bases response item. */
export interface WeknoraKnowledgeBase {
	id: string;
	name: string;
	type: "document" | "faq" | "wiki";
	description?: string;
}

export interface WeknoraKnowledgeBaseListResponse {
	success?: boolean;
	data?: WeknoraKnowledgeBase[];
}

/** POST /knowledge-bases/{id}/knowledge/manual response. */
export interface WeknoraManualResponse {
	success?: boolean;
	data?: {
		id?: string;
		parse_status?: string;
		title?: string;
	};
}
