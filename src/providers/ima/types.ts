import { ProviderConfigBase } from "../registry";

/**
 * Tencent IMA (https://ima.qq.com) provider configuration. Writes are
 * authenticated with a Client ID / API Key pair issued from the IMA
 * agent interface. The target folder is optional — when omitted, notes
 * land in the user's default/all-notes location.
 */
export interface ImaProviderConfig extends ProviderConfigBase {
	kind: "ima";
	/** IMA OpenAPI Client ID. Sent as `ima-openapi-clientid` header. */
	clientId?: string;
	/** IMA OpenAPI API Key. Sent as `ima-openapi-apikey` header. */
	apiKey?: string;
	/** Optional default folder ID for exports. */
	defaultFolderId?: string;
	/** Optional default folder display name (kept for a readable settings card when offline). */
	defaultFolderName?: string;
}

/**
 * Default config. We follow the same Omit pattern as WeKnora/Yinxiang so
 * `id` and `displayName` are seeded by `applyDefaultProviderMigration`.
 */
export const DEFAULT_IMA_CONFIG: Omit<ImaProviderConfig, "id" | "displayName"> = {
	kind: "ima",
	enabled: true,
};

/** IMA OpenAPI base. All requests go to this host only. */
export const IMA_API_BASE = "https://ima.qq.com";

/** Where to send users to create credentials. */
export const IMA_HELP_URL = "https://ima.qq.com/agent-interface";

/**
 * POST /openapi/note/v1/import_doc request body.
 * `content_format` 1 == Markdown (the only value supported for writing).
 */
export interface ImaImportDocRequest {
	content_format: 1;
	content: string;
	folder_id?: string;
}

/** POST /openapi/note/v1/import_doc response. */
export interface ImaImportDocResponse {
	code?: number;
	/** IMA's real envelope uses `msg`; `message` kept for safety. */
	msg?: string;
	message?: string;
	data?: {
		doc_id?: string;
	};
}

/**
 * POST /openapi/note/v1/list_note_folder_by_cursor response.
 * Shape verified against a live 200 response: folders live under
 * `data.note_book_folders[].folder.basic_info`, pagination terminates
 * via `data.is_end` / `data.next_cursor`.
 */
export interface ImaListFolderResponse {
	code?: number;
	/** IMA's real envelope uses `msg`; `message` kept for safety. */
	msg?: string;
	message?: string;
	data?: {
		is_end?: boolean;
		next_cursor?: string;
		note_book_folders?: Array<{
			folder?: {
				/** `folder_type` 1 == virtual "all notes" root, skipped in pickers. */
				basic_info?: {
					folder_id?: string;
					name?: string;
					note_number?: string;
					create_time?: string;
					modify_time?: string;
					folder_type?: number;
					status?: number;
				};
			};
		}>;
	};
	request_id?: string;
}
