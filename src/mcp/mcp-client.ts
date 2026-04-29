import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
	McpServerConfig,
	McpToolDefinition,
	McpToolCallResult,
	McpConnectionState,
} from "./types.js";

const _devLog = (..._args: unknown[]): void => {};

function extractErrorMessage(err: unknown): string {
	if (err instanceof Error) {
		if (err.message) return err.message;
	}
	if (typeof err === "object" && err !== null) {
		const _obj = err as Record<string, unknown>;
		if (typeof _obj.message === "string") return _obj.message;
		if (typeof _obj.error === "string") return _obj.error;
		if (typeof _obj.code === "number" && typeof _obj.message === "string") {
			return `Error ${_obj.code}: ${_obj.message}`;
		}
		try {
			return JSON.stringify(err);
		} catch {
			return "[object Object]";
		}
	}
	return String(err);
}

export class McpClient {
	private readonly client: Client;
	private transport: Transport | null = null;
	private httpUrl?: URL;
	private httpHeaders?: Record<string, string>;
	private state: McpConnectionState = {
		status: "disconnected",
		tools: [],
	};

	constructor(config: McpServerConfig) {
		this.client = new Client({
			name: config.displayName,
			version: "1.0.0",
		});
		const transportType = config.transportType ?? "http";
		if (transportType === "stdio") {
			if (!config.command) throw new Error("stdio transport requires command");
			this.transport = new StdioClientTransport({
				command: config.command,
				args: config.args,
				env: config.env,
			});
		} else {
			if (!config.url) throw new Error("http transport requires url");
			this.httpUrl = new URL(config.url);
			this.httpHeaders = config.headers ?? {};
		}
	}

	async connect(): Promise<void> {
		try {
			this.state = { ...this.state, status: "connecting" };

			if (this.httpUrl) {
				try {
					const streamableTransport = new StreamableHTTPClientTransport(this.httpUrl, {
						requestInit: Object.keys(this.httpHeaders ?? {}).length > 0
							? { headers: this.httpHeaders }
							: undefined,
					});
					await this.client.connect(streamableTransport);
					this.transport = streamableTransport;
				} catch (streamableErr) {
					_devLog("StreamableHTTP failed, trying SSE fallback", streamableErr);
					const sseModule = (await import("@modelcontextprotocol/sdk/client/sse.js")) as unknown as {
						SSEClientTransport: new (url: URL, opts?: { requestInit?: { headers?: Record<string, string> } }) => Transport;
					};
					const SSETransport = sseModule.SSEClientTransport;
					const sseTransport = new SSETransport(this.httpUrl, {
						requestInit: Object.keys(this.httpHeaders ?? {}).length > 0
							? { headers: this.httpHeaders }
							: undefined,
					});
					await this.client.connect(sseTransport);
					this.transport = sseTransport;
				}
			} else {
				await this.client.connect(this.transport!);
			}

			const toolsResult = await this.client.listTools();

			const serverVersion: { name?: string; version?: string } | undefined = (this.client as unknown as { getServerVersion?(): { name?: string; version?: string } }).getServerVersion?.();

			this.state = {
				status: "connected",
				tools: (toolsResult.tools as McpToolDefinition[]) ?? [],
				serverInfo: serverVersion
					? { name: serverVersion.name ?? "MCP Server", version: serverVersion.version ?? "unknown" }
					: undefined,
			};
		} catch (err) {
			const message = extractErrorMessage(err);
			this.state = { ...this.state, status: "error", error: message };
			throw new Error(message);
		}
	}

	async disconnect(): Promise<void> {
		try {
			await this.client.close();
			this.state = { status: "disconnected", tools: [] };
		} catch (err) {
			this.state = { ...this.state, status: "error", error: extractErrorMessage(err) };
			throw err;
		}
	}

	async invokeTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<McpToolCallResult> {
		try {
			const result = await this.client.callTool({ name, arguments: args });
			return {
				content: result.content as McpToolCallResult["content"],
				isError: result.isError as boolean | undefined,
			};
		} catch (err) {
			_devLog("McpClient.invokeTool error", name, args, err);
			throw err;
		}
	}

	getState(): McpConnectionState {
		return this.state;
	}

	getTools(): McpToolDefinition[] {
		return this.state.tools;
	}
}
