import { McpClient } from "../../mcp/mcp-client";
import { McpServerConfig } from "../../mcp/types";
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
import { formatFlomoContent, pickFlomoWriteTool } from "./format";
import { FLOMO_MCP_URL, FlomoProviderConfig } from "./types";
import { t } from "../../i18n";

/**
 * Push-only provider for Flomo's official streamable-HTTP MCP at
 * `https://flomoapp.com/mcp`. Authenticates with a Bearer token issued
 * via Flomo's MCP settings page. Read paths (fetch / listRemote) are
 * unsupported because Flomo's MCP is a write surface today; if that
 * changes we add them later.
 */
export class FlomoProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "notebook-pen";
	readonly capabilities: ProviderCapabilities = {
		canImport: false,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	private mcpClient: McpClient | null = null;

	constructor(private readonly config: FlomoProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || "Flomo";
	}

	available(): ProviderAvailability {
		const token = this.config.apiToken?.trim();
		if (!token) {
			return { ok: false, reason: t("providers.enableInSettings") };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		const content = formatFlomoContent(note);
		if (content.length === 0) {
			throw new Error("Cannot push an empty memo to Flomo");
		}
		const client = await this.connectMcp();
		const toolName = pickFlomoWriteTool(client.getTools(), this.config.writeToolName);
		const result = await client.invokeTool(toolName, { content });
		if (result.isError) {
			const text = result.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n")
				.trim();
			throw new Error(`Flomo ${toolName} failed: ${text || "unknown error"}`);
		}
		const text = result.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n")
			.trim();
		return { remoteId: extractMemoUrl(text) ?? "" };
	}

	async fetch(_remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		throw new Error("Flomo MCP does not support reading memos");
	}

	async listRemote(_opts?: ListOptions): Promise<RemoteListItem[]> {
		throw new Error("Flomo MCP does not support listing memos");
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			const client = await this.connectMcp();
			const tools = client.getTools();
			const writeTool = pickFlomoWriteTool(tools, this.config.writeToolName);
			return {
				ok: true,
				message: `${t("providers.connectionSuccess")} — ${tools.length} tool(s); '${writeTool}'`,
			};
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

	private async connectMcp(): Promise<McpClient> {
		if (this.mcpClient) {
			const state = this.mcpClient.getState();
			if (state.status === "connected") return this.mcpClient;
			await this.mcpClient.disconnect().catch(() => {});
			this.mcpClient = null;
		}
		const token = this.config.apiToken?.trim();
		if (!token) throw new Error(t("notices.apiKeyRequired"));
		const cfg: McpServerConfig = {
			id: `${this.config.id}-mcp`,
			kind: "mcp",
			displayName: this.displayName,
			enabled: true,
			transportType: "http",
			url: FLOMO_MCP_URL,
			headers: { Authorization: `Bearer ${token}` },
		};
		const client = new McpClient(cfg);
		await client.connect();
		this.mcpClient = client;
		return client;
	}
}

export const flomoFactory: ProviderFactory<FlomoProviderConfig> = {
	kind: "flomo",
	create(config) {
		return new FlomoProvider(config);
	},
};

/**
 * Pull a Flomo memo URL out of the server's response when present.
 * The official server returns text like:
 *   "Successfully wrote memo: https://v.flomoapp.com/mine/?memo_id=xxxxx"
 * Falls back to the empty string when no URL is found, leaving
 * `remoteId` empty (matches the WPS / Bear conventions for write-only
 * round trips).
 */
function extractMemoUrl(text: string): string | null {
	const match = text.match(/https?:\/\/[^\s)>]+/);
	return match ? match[0] : null;
}
