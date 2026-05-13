import { ProviderConfigBase } from "../providers/registry";

export interface McpServerConfig extends ProviderConfigBase {
	kind: "mcp";
	transportType?: "http" | "stdio";
	url?: string;
	headers?: Record<string, string>;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
}

export interface McpToolDefinition {
	name: string;
	description?: string;
	inputSchema: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
	};
}

export interface McpToolCallResult {
	content: Array<
		| { type: "text"; text: string }
		| { type: "image"; data: string; mimeType: string }
		| { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } }
	>;
	isError?: boolean;
}

export interface McpConnectionState {
	status: "disconnected" | "connecting" | "connected" | "error";
	serverInfo?: { name: string; version: string };
	tools: McpToolDefinition[];
	error?: string;
}

export const DEFAULT_MCP_SERVER_CONFIG: Omit<McpServerConfig, "id" | "displayName"> = {
	kind: "mcp",
	transportType: "http",
	url: "",
	enabled: true,
	headers: {},
};
