import { ProviderConfigBase } from "../registry";

export interface YinxiangProviderConfig extends ProviderConfigBase {
	kind: "yinxiang";
	/** Yinxiang auth token (S=s... format) */
	apiKey?: string;
	/** Optional default notebook GUID for exports */
	defaultNotebookGuid?: string;
	/** Optional default notebook name (for display) */
	defaultNotebookName?: string;
}

export const DEFAULT_YINXIANG_CONFIG: Omit<YinxiangProviderConfig, "id" | "displayName"> = {
	kind: "yinxiang",
	enabled: true,
};

export const YINXIANG_API_BASE = "https://app.yinxiang.com/third";
export const YINXIANG_OAUTH_URL = "https://app.yinxiang.com/third/skills-oauth/";

export interface YinxiangNoteBook {
	guid: string;
	name: string;
}

export interface YinxiangTag {
	tagGuid: string;
	tagName: string;
}

export interface YinxiangNoteDetail {
	noteGuid: string;
	noteTitle: string;
	content?: string;
	notebookName?: string;
	tagList?: YinxiangTag[];
}

export interface YinxiangSearchResponse {
	code?: number;
	message?: string;
	data?: {
		noteDetailList?: YinxiangNoteDetail[];
	};
}

export interface YinxiangNotebookResponse {
	code?: number;
	message?: string;
	data?: {
		noteBookList?: YinxiangNoteBook[];
	};
}

export interface YinxiangNoteDetailResponse {
	code?: number;
	message?: string;
	data?: {
		dataDetail?: YinxiangNoteDetail & { content?: string };
	};
}

export interface YinxiangCreateResponse {
	code?: number;
	message?: string;
	data?: {
		guid?: string;
	};
}
