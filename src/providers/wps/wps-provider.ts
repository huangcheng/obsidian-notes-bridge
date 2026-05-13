import { Platform } from "obsidian";
import { McpClient } from "../../mcp/mcp-client";
import { McpServerConfig } from "../../mcp/types";
import { CliMissingError, runChild } from "../../util/subprocess";
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
import { WPS_TOOLS, WpsProviderConfig } from "./types";
import { t } from "../../i18n";

interface WpsEnvelope<T = unknown> {
	ok: boolean;
	code?: string;
	message?: string;
	retryable?: boolean;
	data?: T;
	hints?: string[];
}

const MD_CODEBLOCK_OPEN = '<codeblock lang="markdown">';
const MD_CODEBLOCK_CLOSE = "</codeblock>";

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function unescapeXml(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

/**
 * Pull the first `<codeblock lang="markdown">…</codeblock>` block out of
 * a WPS XML response (notes pushed by us round-trip through this).
 * Falls back to stripping XML tags when no codeblock is present.
 */
function extractMarkdownBody(xml: string): string {
	const escapedOpen = MD_CODEBLOCK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedClose = MD_CODEBLOCK_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`${escapedOpen}([\\s\\S]*?)${escapedClose}`);
	const m = xml.match(re);
	if (m && m[1] !== undefined) return unescapeXml(m[1]);
	return xml.replace(/<[^>]+>/g, "").trim();
}

function parseEnvelope(raw: string): WpsEnvelope {
	const trimmed = raw.trim();
	if (!trimmed) return { ok: true };
	try {
		const parsed = JSON.parse(trimmed) as WpsEnvelope;
		if (typeof parsed.ok === "boolean") return parsed;
		// Some tools return data directly without an envelope; treat as success.
		return { ok: true, data: parsed };
	} catch {
		// Plain text response — return as-is in `data` so callers can inspect.
		return { ok: true, data: trimmed };
	}
}

/**
 * Wrap shared `runChild` with a WPS-specific not-found message.
 */
async function runWpsCli(
	bin: string,
	args: string[],
	signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
	try {
		return await runChild(bin, args, { signal });
	} catch (err) {
		if (err instanceof CliMissingError) {
			throw new Error(
				t("providers.cliNotFound", { provider: `wpsnote-cli (${bin})` }),
			);
		}
		throw err;
	}
}

export class WpsProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "file-text";
	readonly capabilities: ProviderCapabilities = {
		canImport: true,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	private mcpClient: McpClient | null = null;

	constructor(private readonly config: WpsProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || "WPS Cloud Note";
	}

	available(): ProviderAvailability {
		if (this.config.transport === "cli" && !Platform.isDesktop) {
			return { ok: false, reason: t("providers.unavailable", { provider: t("brands.wps") }) };
		}
		if (
			this.config.transport === "mcp" &&
			this.config.mcp?.transportType === "stdio" &&
			!Platform.isDesktop
		) {
			return { ok: false, reason: t("providers.unavailable", { provider: t("brands.wps") }) };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		const created = await this.callTool(WPS_TOOLS.createNote, { title: note.title });
		const noteId = readString(created, ["fileId", "note_id", "id"]);
		if (!noteId) throw new Error("WPS create_note did not return a note id");

		if (note.body && note.body.trim().length > 0) {
			const outline = await this.callTool(WPS_TOOLS.getNoteOutline, { note_id: noteId });
			const anchorId = firstBlockId(outline);
			const xml = `${MD_CODEBLOCK_OPEN}${escapeXml(note.body)}${MD_CODEBLOCK_CLOSE}`;
			if (anchorId) {
				await this.callTool(WPS_TOOLS.editBlock, {
					note_id: noteId,
					op: "replace",
					block_id: anchorId,
					content: xml,
				});
			} else {
				// Empty notes still expose a placeholder block; if outline
				// returned nothing, fall back to inserting at the document root.
				await this.callTool(WPS_TOOLS.editBlock, {
					note_id: noteId,
					op: "insert",
					anchor_id: "",
					position: "after",
					content: xml,
				});
			}
		}
		return { remoteId: noteId };
	}

	async fetch(remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		const data = await this.callTool(WPS_TOOLS.readNote, { note_id: remoteId });
		const xml = readNoteXml(data);
		const body = extractMarkdownBody(xml);
		const info = await this.callTool(WPS_TOOLS.getNoteInfo, { note_id: remoteId }).catch(() => null);
		const title = readString(info, ["title"]) ?? "Untitled WPS Note";
		const tags = readStringArray(info, ["tags"]);
		return {
			remoteId,
			title,
			body,
			tags,
			attachments: [],
			sourceMeta: { source: "wps", transport: this.config.transport },
		};
	}

	async listRemote(opts?: ListOptions): Promise<RemoteListItem[]> {
		const tool = opts?.query ? WPS_TOOLS.searchNotes : WPS_TOOLS.listNotes;
		const args = opts?.query
			? { keyword: opts.query, limit: 50 }
			: { sort: "update_time", direction: "desc", limit: 50 };
		const data = await this.callTool(tool, args);
		return readNoteList(data);
	}

	async delete(remoteId: string): Promise<void> {
		await this.callTool(WPS_TOOLS.deleteNote, { note_id: remoteId });
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			if (this.config.transport === "cli") {
				const bin = this.config.cli?.binPath?.trim() || "wpsnote-cli";
				const result = await runWpsCli(bin, ["status", "--json"]);
				if (result.code !== 0) {
					return { ok: false, message: result.stderr.trim() || `wpsnote-cli exited with code ${result.code}` };
				}
				const env = parseEnvelope(result.stdout);
				return { ok: env.ok !== false, message: env.message ?? t("providers.connectionSuccess") };
			}
			const client = await this.connectMcp();
			const tools = client.getTools();
			return { ok: true, message: `${t("providers.connectionSuccess")} — ${tools.length} tool(s)` };
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	async dispose(): Promise<void> {
		if (this.mcpClient) {
			await this.mcpClient.disconnect().catch(() => {});
			this.mcpClient = null;
		}
	}

	private async callTool(
		tool: { mcp: string; cli: string },
		args: Record<string, unknown>,
	): Promise<unknown> {
		if (this.config.transport === "cli") {
			return this.callCli(tool.cli, args);
		}
		return this.callMcp(tool.mcp, args);
	}

	private async callMcp(name: string, args: Record<string, unknown>): Promise<unknown> {
		const client = await this.connectMcp();
		const result = await client.invokeTool(name, args);
		const text = result.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");
		const env = parseEnvelope(text);
		if (env.ok === false) {
			throw new Error(`WPS ${name} failed: ${env.code ?? "ERROR"} ${env.message ?? ""}`.trim());
		}
		return env.data ?? text;
	}

	private async callCli(command: string, args: Record<string, unknown>): Promise<unknown> {
		const bin = this.config.cli?.binPath?.trim() || "wpsnote-cli";
		const argv = [command, "--json", "--json-args", JSON.stringify(args)];
		const result = await runWpsCli(bin, argv);
		if (result.code !== 0) {
			const stderr = result.stderr.trim();
			throw new Error(stderr || `wpsnote-cli ${command} exited with code ${result.code}`);
		}
		const env = parseEnvelope(result.stdout);
		if (env.ok === false) {
			throw new Error(`WPS ${command} failed: ${env.code ?? "ERROR"} ${env.message ?? ""}`.trim());
		}
		return env.data ?? result.stdout.trim();
	}

	private async connectMcp(): Promise<McpClient> {
		if (this.mcpClient) {
			const state = this.mcpClient.getState();
			if (state.status === "connected") return this.mcpClient;
			await this.mcpClient.disconnect().catch(() => {});
			this.mcpClient = null;
		}
		const cfg: McpServerConfig = {
			id: `${this.config.id}-mcp`,
			kind: "mcp",
			displayName: this.displayName,
			enabled: true,
			transportType: this.config.mcp?.transportType ?? "http",
			url: this.config.mcp?.url,
			headers: this.config.mcp?.headers,
			command: this.config.mcp?.command,
			args: this.config.mcp?.args,
			env: this.config.mcp?.env,
		};
		const client = new McpClient(cfg);
		await client.connect();
		this.mcpClient = client;
		return client;
	}
}

function readString(data: unknown, keys: string[]): string | undefined {
	if (!data || typeof data !== "object") return undefined;
	const obj = data as Record<string, unknown>;
	for (const k of keys) {
		const v = obj[k];
		if (typeof v === "string" && v.length > 0) return v;
	}
	return undefined;
}

function readStringArray(data: unknown, keys: string[]): string[] {
	if (!data || typeof data !== "object") return [];
	const obj = data as Record<string, unknown>;
	for (const k of keys) {
		const v = obj[k];
		if (Array.isArray(v)) {
			return v.filter((x): x is string => typeof x === "string");
		}
	}
	return [];
}

function firstBlockId(outline: unknown): string | null {
	if (!outline || typeof outline !== "object") return null;
	const obj = outline as Record<string, unknown>;
	const blocks = obj.blocks ?? obj.outline ?? obj.items;
	if (Array.isArray(blocks) && blocks.length > 0) {
		const first = blocks[0] as Record<string, unknown>;
		const id = first.id ?? first.block_id;
		if (typeof id === "string") return id;
	}
	return null;
}

function readNoteXml(data: unknown): string {
	if (typeof data === "string") return data;
	if (data && typeof data === "object") {
		const obj = data as Record<string, unknown>;
		if (typeof obj.xml === "string") return obj.xml;
		if (typeof obj.content === "string") return obj.content;
		if (typeof obj.text === "string") return obj.text;
	}
	return "";
}

function readNoteList(data: unknown): RemoteListItem[] {
	if (!data || typeof data !== "object") return [];
	const obj = data as Record<string, unknown>;
	const notes = obj.notes ?? obj.items ?? obj;
	if (!Array.isArray(notes)) return [];
	const out: RemoteListItem[] = [];
	for (const n of notes) {
		if (!n || typeof n !== "object") continue;
		const r = n as Record<string, unknown>;
		const remoteId =
			typeof r.note_id === "string"
				? r.note_id
				: typeof r.fileId === "string"
					? r.fileId
					: typeof r.id === "string"
						? r.id
						: "";
		if (!remoteId) continue;
		const title = typeof r.title === "string" ? r.title : "Untitled";
		const item: RemoteListItem = { remoteId, title };
		const updatedAt =
			typeof r.update_time === "string"
				? r.update_time
				: typeof r.updatedAt === "string"
					? r.updatedAt
					: undefined;
		if (updatedAt) item.updatedAt = updatedAt;
		out.push(item);
	}
	return out;
}

export const wpsFactory: ProviderFactory<WpsProviderConfig> = {
	kind: "wps",
	create(config) {
		return new WpsProvider(config);
	},
};
