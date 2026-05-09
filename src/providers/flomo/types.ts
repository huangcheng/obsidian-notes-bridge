import { ProviderConfigBase } from "../registry";

export interface FlomoProviderConfig extends ProviderConfigBase {
	kind: "flomo";
	/** Bearer token issued from https://flomoapp.com (Settings → MCP). */
	apiToken?: string;
	/** Override for the MCP write tool name. Default: auto-pick from the server's tool list. */
	writeToolName?: string;
}

export const FLOMO_MCP_URL = "https://flomoapp.com/mcp";

export const DEFAULT_FLOMO_CONFIG: Omit<FlomoProviderConfig, "id" | "displayName"> = {
	kind: "flomo",
	enabled: true,
	trusted: false,
};

export const FLOMO_TOKEN_HELP_URL = "https://help.flomoapp.com/advance/mcp/token.html";
