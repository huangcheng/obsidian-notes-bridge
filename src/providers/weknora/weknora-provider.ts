import { requestUrl } from "obsidian";
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
import { t } from "../../i18n";
import {
	WeknoraKnowledgeBase,
	WeknoraKnowledgeBaseListResponse,
	WeknoraManualResponse,
	WeknoraProviderConfig,
	WEKNORA_CHANNEL,
} from "./types";
import { describeWeknoraHttpError, normalizeWeknoraBaseUrl } from "./helpers";

/**
 * Push-only provider for a WeKnora (https://github.com/Tencent/WeKnora)
 * server. Replicates the browser extension's save pattern: authenticate
 * with a long-lived API key (X-API-Key) against a user-configured base
 * URL, and save Markdown notes via the `/knowledge/manual` ingest
 * endpoint. Read paths (fetch / listRemote) are unsupported.
 */
export class WeknoraProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "database";
	readonly capabilities: ProviderCapabilities = {
		canImport: false,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	constructor(private readonly config: WeknoraProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || t("brands.weknora");
	}

	available(): ProviderAvailability {
		if (!this.config.baseUrl?.trim() || !this.config.apiKey?.trim() || !this.config.knowledgeBaseId?.trim()) {
			return { ok: false, reason: t("providers.enableInSettings") };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		const { base, key, kbId } = this.requirePushConfig();
		const title = note.title.trim() || "Untitled";

		let response;
		try {
			response = await requestUrl({
				url: `${base}/knowledge-bases/${encodeURIComponent(kbId)}/knowledge/manual`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": key,
				},
				body: JSON.stringify({
					title,
					content: note.body,
					channel: WEKNORA_CHANNEL,
				}),
				throw: false,
			});
		} catch {
			throw new Error(t("providers.weknoraUnreachable"));
		}

		if (response.status < 200 || response.status >= 300) {
			throw new Error(describeWeknoraHttpError(response.status, safeJson(response)));
		}

		const result = (response.json || {}) as WeknoraManualResponse;
		if (result.success === false) {
			throw new Error(t("providers.weknoraCreateFailed"));
		}
		return { remoteId: result.data?.id ?? "" };
	}

	async fetch(_remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		throw new Error(t("providers.weknoraReadUnsupported"));
	}

	async listRemote(_opts?: ListOptions): Promise<RemoteListItem[]> {
		throw new Error(t("providers.weknoraReadUnsupported"));
	}

	/**
	 * List knowledge bases for the configured endpoint/key. Used by the
	 * settings card's "refresh" button to populate the knowledge-base
	 * picker. Returns only what the API returns (already scoped to the
	 * key's allowed KBs).
	 */
	async listKnowledgeBases(): Promise<WeknoraKnowledgeBase[]> {
		const { base, key } = this.requireConnectionConfig();
		let response;
		try {
			response = await requestUrl({
				url: `${base}/knowledge-bases`,
				method: "GET",
				headers: { "X-API-Key": key },
				throw: false,
			});
		} catch {
			throw new Error(t("providers.weknoraUnreachable"));
		}
		if (response.status < 200 || response.status >= 300) {
			throw new Error(describeWeknoraHttpError(response.status, safeJson(response)));
		}
		const result = (response.json || {}) as WeknoraKnowledgeBaseListResponse;
		return result.data ?? [];
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			const kbs = await this.listKnowledgeBases();
			return {
				ok: true,
				message: `${t("providers.connectionSuccess")} — ${kbs.length} knowledge base(s)`,
			};
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	dispose(): void {
		// No long-lived resources (no MCP client, no subprocess).
	}

	private requireConnectionConfig(): { base: string; key: string } {
		const base = normalizeWeknoraBaseUrl(this.config.baseUrl ?? "");
		const key = this.config.apiKey?.trim() ?? "";
		if (!base || !key) {
			throw new Error(t("providers.weknoraIncompleteConfig"));
		}
		return { base, key };
	}

	private requirePushConfig(): { base: string; key: string; kbId: string } {
		const { base, key } = this.requireConnectionConfig();
		const kbId = this.config.knowledgeBaseId?.trim() ?? "";
		if (!kbId) {
			throw new Error(t("providers.weknoraIncompleteConfig"));
		}
		return { base, key, kbId };
	}
}

function safeJson(response: { json?: unknown }): unknown {
	try {
		return response.json ?? undefined;
	} catch {
		return undefined;
	}
}

export const weknoraFactory: ProviderFactory<WeknoraProviderConfig> = {
	kind: "weknora",
	create(config) {
		return new WeknoraProvider(config);
	},
};
