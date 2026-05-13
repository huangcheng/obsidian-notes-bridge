import { ProviderConfigBase } from "../registry";

export type WpsTransport = "mcp" | "cli";

export interface WpsMcpTransportConfig {
	transportType?: "http" | "stdio";
	url?: string;
	headers?: Record<string, string>;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
}

export interface WpsCliTransportConfig {
	/** Override the CLI binary path. Default: `wpsnote-cli` (resolved via PATH). */
	binPath?: string;
}

export interface WpsProviderConfig extends ProviderConfigBase {
	kind: "wps";
	transport: WpsTransport;
	mcp?: WpsMcpTransportConfig;
	cli?: WpsCliTransportConfig;
}

export const DEFAULT_WPS_CONFIG: Omit<WpsProviderConfig, "id" | "displayName"> = {
	kind: "wps",
	transport: "mcp",
	enabled: true,
	mcp: {
		transportType: "http",
		url: "",
		headers: {},
	},
	cli: {
		binPath: "wpsnote-cli",
	},
};

/**
 * Canonical WPS Note tool / CLI command names. Both transports map 1:1
 * (CLI is a thin wrapper of the MCP tools per upstream docs).
 */
export const WPS_TOOLS = {
	createNote: { mcp: "create_note", cli: "create" },
	getNoteOutline: { mcp: "get_note_outline", cli: "outline" },
	editBlock: { mcp: "edit_block", cli: "edit" },
	readNote: { mcp: "read_note", cli: "read" },
	listNotes: { mcp: "list_notes", cli: "list" },
	searchNotes: { mcp: "search_notes", cli: "find" },
	deleteNote: { mcp: "delete_note", cli: "delete" },
	getNoteInfo: { mcp: "get_note_info", cli: "info" },
} as const;
