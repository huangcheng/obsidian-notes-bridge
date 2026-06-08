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
	YINXIANG_API_BASE,
	YinxiangCreateResponse,
	YinxiangNotebookResponse,
	YinxiangNoteDetailResponse,
	YinxiangProviderConfig,
	YinxiangSearchResponse,
} from "./types";

export class YinxiangProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "book-marked";
	readonly capabilities: ProviderCapabilities = {
		canImport: true,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	constructor(private readonly config: YinxiangProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || t("brands.yinxiang");
	}

	available(): ProviderAvailability {
		const token = this.config.apiKey?.trim();
		if (!token) {
			return { ok: false, reason: t("providers.enableInSettings") };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		const token = this.getToken();
		const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, "-").trim() || "Untitled";

		// Convert Markdown to simple ENML-compatible HTML
		const htmlContent = markdownToEnml(note.body);

		const payload: Record<string, unknown> = {
			title: safeTitle,
			content: htmlContent,
		};

		if (this.config.defaultNotebookGuid) {
			payload.notebookGuid = this.config.defaultNotebookGuid;
		}

		const response = await requestUrl({
			url: `${YINXIANG_API_BASE}/third-party-note-service/restful/v1/createNoteFromMCP`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				auth: token,
			},
			body: JSON.stringify(payload),
		});

		const result = response.json as YinxiangCreateResponse;
		if (result.code !== 0 && result.code !== undefined) {
			throw new Error(result.message || `Yinxiang create note failed (code ${result.code})`);
		}

		return { remoteId: result.data?.guid || "" };
	}

	async fetch(remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		const token = this.getToken();
		const response = await requestUrl({
			url: `${YINXIANG_API_BASE}/ai-chat-note/grpc-api/search/getNoteDetail`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				auth: token,
			},
			body: JSON.stringify({
				guid: remoteId,
				resultSpec: {
					includeContent: true,
					includeResources: false,
					includeTags: true,
					includeResourceContent: false,
				},
			}),
		});

		const result = response.json as YinxiangNoteDetailResponse;
		if (result.code !== 0 && result.code !== undefined) {
			throw new Error(result.message || `Yinxiang fetch note failed (code ${result.code})`);
		}

		const detail = result.data?.dataDetail;
		if (!detail) {
			throw new Error("Note not found or empty response");
		}

		const body = enmlToMarkdown(detail.content || "");
		const tags = (detail.tagList || []).map((t) => t.tagName);

		return {
			remoteId,
			title: detail.noteTitle || "Untitled",
			body,
			tags,
			attachments: [],
			sourceMeta: { source: "yinxiang" },
		};
	}

	async listRemote(opts?: ListOptions): Promise<RemoteListItem[]> {
		const token = this.getToken();
		const payload: Record<string, unknown> = {
			resultSpec: {
				includeContent: false,
				includeResources: false,
				includeTags: true,
				includeResourceContent: false,
			},
		};

		if (opts?.query) {
			payload.keyword = opts.query;
		}

		const response = await requestUrl({
			url: `${YINXIANG_API_BASE}/ai-chat-note/grpc-api/search/searchNotesByFilter`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				auth: token,
			},
			body: JSON.stringify(payload),
		});

		const result = response.json as YinxiangSearchResponse;
		if (result.code !== 0 && result.code !== undefined) {
			throw new Error(result.message || `Yinxiang list notes failed (code ${result.code})`);
		}

		const notes = result.data?.noteDetailList || [];
		return notes.map((n) => ({
			remoteId: n.noteGuid,
			title: n.noteTitle || "Untitled",
		}));
	}

	async listNoteBooks(): Promise<{ guid: string; name: string }[]> {
		const token = this.getToken();
		const response = await requestUrl({
			url: `${YINXIANG_API_BASE}/ai-chat-note/grpc-api/search/listNoteBooks`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				auth: token,
			},
			body: JSON.stringify({}),
		});

		const result = response.json as YinxiangNotebookResponse;
		if (result.code !== 0 && result.code !== undefined) {
			throw new Error(result.message || `Yinxiang list notebooks failed (code ${result.code})`);
		}

		return (result.data?.noteBookList || []).map((nb) => ({
			guid: nb.guid,
			name: nb.name,
		}));
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			const token = this.getToken();
			if (!token.startsWith("S=s")) {
				return { ok: false, message: "Invalid token format. Token must start with 'S=s'." };
			}

			// Try listing notebooks as a lightweight connectivity test
			const response = await requestUrl({
				url: `${YINXIANG_API_BASE}/ai-chat-note/grpc-api/search/listNoteBooks`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					auth: token,
				},
				body: JSON.stringify({}),
			});

			const result = response.json as YinxiangNotebookResponse;
			if (result.code !== 0 && result.code !== undefined) {
				return { ok: false, message: result.message || `API error (code ${result.code})` };
			}

			const count = result.data?.noteBookList?.length ?? 0;
			return {
				ok: true,
				message: `${t("providers.connectionSuccess")} — ${count} notebook(s) found`,
			};
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	private getToken(): string {
		const token = this.config.apiKey?.trim();
		if (!token) throw new Error(t("notices.apiKeyRequired"));
		return token;
	}
}

export const yinxiangFactory: ProviderFactory<YinxiangProviderConfig> = {
	kind: "yinxiang",
	create(config) {
		return new YinxiangProvider(config);
	},
};

/**
 * Convert Markdown to ENML-compatible HTML.
 * This is a simplified conversion handling basic formatting.
 */
function markdownToEnml(markdown: string): string {
	if (!markdown) return "";

	let html = markdown
		// Escape HTML entities
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		// Headers
		.replace(/^###### (.*$)/gim, "<h6>$1</h6>")
		.replace(/^##### (.*$)/gim, "<h5>$1</h5>")
		.replace(/^#### (.*$)/gim, "<h4>$1</h4>")
		.replace(/^### (.*$)/gim, "<h3>$1</h3>")
		.replace(/^## (.*$)/gim, "<h2>$1</h2>")
		.replace(/^# (.*$)/gim, "<h1>$1</h1>")
		// Bold and italic
		.replace(/\*\*\*(.*?)\*\*\*/gim, "<b><i>$1</i></b>")
		.replace(/\*\*(.*?)\*\*/gim, "<b>$1</b>")
		.replace(/\*(.*?)\*/gim, "<i>$1</i>")
		.replace(/__(.*?)__/gim, "<b>$1</b>")
		.replace(/_(.*?)_/gim, "<i>$1</i>")
		// Strikethrough
		.replace(/~~(.*?)~~/gim, "<s>$1</s>")
		// Links [text](url)
		.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
		// Unordered lists
		.replace(/^\s*[-*+] (.*$)/gim, "<li>$1</li>")
		// Ordered lists
		.replace(/^\s*\d+\. (.*$)/gim, "<li>$1</li>")
		// Code blocks (inline)
		.replace(/`([^`]+)`/gim, "<code>$1</code>")
		// Line breaks
		.replace(/\n/gim, "<br/>");

	// Wrap list items in ul/ol (simplified)
	html = html.replace(/(<li>.*?<\/li><br\/>?)+/gim, function (match) {
		return "<ul>" + match.replace(/<br\/>/g, "") + "</ul>";
	});

	return `<div>${html}</div>`;
}

/**
 * Convert ENML/XHTML to Markdown.
 * Handles basic tags commonly found in Yinxiang notes.
 */
function enmlToMarkdown(enml: string): string {
	if (!enml) return "";

	let md = enml
		// Remove XML declaration and DOCTYPE
		.replace(/<\?xml[^?]*\?\u003e/g, "")
		.replace(/<!DOCTYPE[^\u003e]*>/gi, "")
		// Remove en-note wrapper
		.replace(/<\/?en-note[^\u003e]*>/gi, "")
		// Headers
		.replace(/<h1[^\u003e]*>(.*?)<\/h1>/gi, "# $1\n")
		.replace(/<h2[^\u003e]*>(.*?)<\/h2>/gi, "## $1\n")
		.replace(/<h3[^\u003e]*>(.*?)<\/h3>/gi, "### $1\n")
		.replace(/<h4[^\u003e]*>(.*?)<\/h4>/gi, "#### $1\n")
		.replace(/<h5[^\u003e]*>(.*?)<\/h5>/gi, "##### $1\n")
		.replace(/<h6[^\u003e]*>(.*?)<\/h6>/gi, "###### $1\n")
		// Bold and italic
		.replace(/<b>(.*?)<\/b>/gi, "**$1**")
		.replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
		.replace(/<i>(.*?)<\/i>/gi, "*$1*")
		.replace(/<em>(.*?)<\/em>/gi, "*$1*")
		// Underline
		.replace(/<u>(.*?)<\/u>/gi, "_$1_")
		// Strikethrough
		.replace(/<s>(.*?)<\/s>/gi, "~~$1~~")
		.replace(/<strike>(.*?)<\/strike>/gi, "~~$1~~")
		// Links
		.replace(/<a[^\u003e]*href="([^"]*)"[^\u003e]*>(.*?)<\/a>/gi, "[$2]($1)")
		// Lists
		.replace(/<ul>\s*/gi, "")
		.replace(/<\/ul>\s*/gi, "")
		.replace(/<ol>\s*/gi, "")
		.replace(/<\/ol>\s*/gi, "")
		.replace(/<li>(.*?)<\/li>/gi, "- $1\n")
		// Code
		.replace(/<code>(.*?)<\/code>/gi, "`$1`")
		// Line breaks
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<div>\s*/gi, "")
		.replace(/<\/div>\s*/gi, "\n")
		.replace(/<p>\s*/gi, "")
		.replace(/<\/p>\s*/gi, "\n")
		// Remove remaining tags
		.replace(/<[^\u003e]+>/g, "")
		// Unescape entities
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");

	return md.trim();
}
