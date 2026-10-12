import { ProviderConfigBase } from "../registry";

/**
 * Octop provider configuration (settings-card fields only).
 * JWTs live in PluginSettings.octopAuth[configId], not here.
 */
export interface OctopProviderConfig extends ProviderConfigBase {
	kind: "octop";
	/** API base including /api, e.g. http://localhost:5174/api */
	baseUrl?: string;
	username?: string;
	password?: string;
	knowledgeBaseId?: string;
	knowledgeBaseName?: string;
}

export const DEFAULT_OCTOP_CONFIG: Omit<OctopProviderConfig, "id" | "displayName"> = {
	kind: "octop",
	enabled: true,
};

export const OCTOP_API_URL_PLACEHOLDER = "http://localhost:5174/api";

/** Persisted auth entry keyed by provider config id. */
export interface OctopAuthEntry {
	accessToken?: string;
	accessTokenExpiresAt?: number;
	lastKnownExpiresInMs?: number;
	authFailed?: boolean;
	/** SHA-256 hex of credentials; enables clear-on-change across restarts. */
	credentialsFingerprint?: string;
}

export type OctopErrorCode =
	| "incomplete"
	| "authFailed"
	| "unreachable"
	| "timeout"
	| "forbidden"
	| "notFound"
	| "wrongBaseUrl"
	| "prerequisites"
	| "capabilityUnavailable"
	| "conflict"
	| "tooLarge"
	| "validation"
	| "rateLimited"
	| "serverError"
	| "createFailed";

export interface OctopKnowledgeBase {
	id: string;
	name: string;
	description?: string;
	doc_count?: number;
}

export interface OctopCapability {
	feature_enabled?: boolean;
	usable?: boolean;
	prerequisites_ok?: boolean;
}

export interface OctopLoginResponse {
	access_token?: string;
	token_type?: string;
	expires_in?: number;
}

export interface OctopDocumentResponse {
	id?: string;
	document_id?: string;
	filename?: string;
	status?: string;
	error_message?: string;
}

export const OCTOP_SOFT_EXPIRY_SKEW_MS = 60_000;
export const OCTOP_REQUEST_TIMEOUT_MS = 30_000;
export const OCTOP_RENEW_HEADER = "x-octop-access-token";
