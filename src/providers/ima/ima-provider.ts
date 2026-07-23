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
	IMA_API_BASE,
	ImaImportDocResponse,
	ImaListFolderResponse,
	ImaProviderConfig,
} from "./types";

/**
 * Push-only provider for Tencent IMA (https://ima.qq.com). Authenticates
 * every request with a Client ID / API Key pair (sent as
 * `ima-openapi-clientid` / `ima-openapi-apikey` headers) and saves
 * Markdown notes via the `/openapi/note/v1/import_doc` endpoint.
 * Read paths (fetch / listRemote) are unsupported, mirroring WeKnora.
 *
 * Credentials are only ever sent to `https://ima.qq.com` and are never
 * logged.
 */
export class ImaProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "book-open";
	readonly capabilities: ProviderCapabilities = {
		canImport: false,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	constructor(private readonly config: ImaProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || t("brands.ima");
	}

	available(): ProviderAvailability {
		if (!this.config.clientId?.trim() || !this.config.apiKey?.trim()) {
			return { ok: false, reason: t("providers.enableInSettings") };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		const { clientId, apiKey, folderId } = this.requirePushConfig();

		// IMA's import_doc endpoint takes a single Markdown `content`
		// field. Compose the title as a leading H1 (the note has no
		// separate title field), followed by the body — matching the
		// note-composition intent of WeKnora/Yinxiang while fitting the
		// IMA wire shape.
		const title = note.title.trim() || "Untitled";
		const content = `# ${title}\n\n${note.body}`;

		const payload: Record<string, unknown> = {
			content_format: 1,
			content,
		};
		if (folderId) {
			payload.folder_id = folderId;
		}

		let response;
		try {
			response = await requestUrl({
				url: `${IMA_API_BASE}/openapi/note/v1/import_doc`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"ima-openapi-clientid": clientId,
					"ima-openapi-apikey": apiKey,
				},
				body: JSON.stringify(payload),
				throw: false,
			});
		} catch {
			throw new Error(t("providers.imaUnreachable"));
		}

		if (response.status < 200 || response.status >= 300) {
			throw new Error(describeImaHttpError(response.status, safeJson(response)));
		}

		const result = (response.json || {}) as ImaImportDocResponse;
		// Treat non-zero / explicitly failed `code` values as errors.
		if (result.code !== undefined && result.code !== 0) {
			throw new Error((result.msg ?? result.message) || t("providers.imaCreateFailed"));
		}
		return { remoteId: result.data?.doc_id ?? "" };
	}

	async fetch(_remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		throw new Error(t("providers.imaReadUnsupported"));
	}

	async listRemote(_opts?: ListOptions): Promise<RemoteListItem[]> {
		throw new Error(t("providers.imaReadUnsupported"));
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			const { clientId, apiKey } = this.requireConnectionConfig();
			let response;
			try {
				response = await requestUrl({
					url: `${IMA_API_BASE}/openapi/note/v1/list_note_folder_by_cursor`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"ima-openapi-clientid": clientId,
						"ima-openapi-apikey": apiKey,
					},
					body: JSON.stringify({ cursor: "0", limit: 1 }),
					throw: false,
				});
			} catch {
				return { ok: false, message: t("providers.imaUnreachable") };
			}

			if (response.status < 200 || response.status >= 300) {
				return {
					ok: false,
					message: describeImaHttpError(response.status, safeJson(response)),
				};
			}

			const result = (response.json || {}) as ImaListFolderResponse;
			if (result.code !== undefined && result.code !== 0) {
				return {
					ok: false,
					message: (result.msg ?? result.message) || t("providers.connectionFailed"),
				};
			}
			return { ok: true, message: t("providers.connectionSuccess") };
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	/**
	 * List all of the user's notebook folders, paginating through
	 * `list_note_folder_by_cursor`. The virtual "all notes" root
	 * (`folder_type` 1) is skipped. Used by the settings card's folder
	 * picker.
	 */
	async listFolders(): Promise<{ id: string; name: string }[]> {
		const { clientId, apiKey } = this.requireConnectionConfig();
		const out: { id: string; name: string }[] = [];
		let cursor = "0";
		let guard = 0;
		while (guard++ < 100) {
			let response;
			try {
				response = await requestUrl({
					url: `${IMA_API_BASE}/openapi/note/v1/list_note_folder_by_cursor`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"ima-openapi-clientid": clientId,
						"ima-openapi-apikey": apiKey,
					},
					// IMA requires limit inside (0, 20]; use the max of 20 per page.
				body: JSON.stringify({ cursor, limit: 20 }),
					throw: false,
				});
			} catch {
				throw new Error(t("providers.imaUnreachable"));
			}
			if (response.status < 200 || response.status >= 300) {
				throw new Error(describeImaHttpError(response.status, safeJson(response)));
			}
			const result = (response.json ?? {}) as ImaListFolderResponse;
			if (result.code !== undefined && result.code !== 0) {
				throw new Error((result.msg ?? result.message) || t("providers.connectionFailed"));
			}
			const items = result.data?.note_book_folders ?? [];
			for (const item of items) {
				const bi = item.folder?.basic_info;
				const id = bi?.folder_id?.trim();
				const name = bi?.name?.trim();
				const type = bi?.folder_type;
				if (type === 1) continue; // skip the virtual "all notes" root
				if (id && name) out.push({ id, name });
			}
			cursor = result.data?.next_cursor?.trim() ?? "";
			if (!cursor || result.data?.is_end) break;
		}
		return out;
	}

	dispose(): void {
		// No long-lived resources.
	}

	private requireConnectionConfig(): { clientId: string; apiKey: string } {
		const clientId = this.config.clientId?.trim() ?? "";
		const apiKey = this.config.apiKey?.trim() ?? "";
		if (!clientId || !apiKey) {
			throw new Error(t("providers.imaIncompleteConfig"));
		}
		return { clientId, apiKey };
	}

	private requirePushConfig(): { clientId: string; apiKey: string; folderId: string } {
		const { clientId, apiKey } = this.requireConnectionConfig();
		const folderId = this.config.defaultFolderId?.trim() ?? "";
		return { clientId, apiKey, folderId };
	}
}

function safeJson(response: { json?: unknown }): unknown {
	try {
		return response.json ?? undefined;
	} catch {
		return undefined;
	}
}

function describeImaHttpError(status: number, body: unknown): string {
	// IMA's envelope uses `msg`; fall back to `message` for safety.
	let detail = "";
	if (typeof body === "object" && body !== null) {
		const env = body as { msg?: unknown; message?: unknown };
		detail = env.msg != null ? String(env.msg) : env.message != null ? String(env.message) : "";
	}
	const suffix = detail ? ` — ${detail}` : "";
	return t("providers.imaHttpError", { status: String(status), detail: suffix });
}

export const imaFactory: ProviderFactory<ImaProviderConfig> = {
	kind: "ima",
	create(config) {
		return new ImaProvider(config);
	},
};
