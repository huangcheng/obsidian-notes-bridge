import { Platform } from "obsidian";
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
import { ChildResult, CliMissingError, loadNodeModule, runChild, whichBin } from "../../util/subprocess";
import { YoudaoProviderConfig } from "./types";
import { t } from "../../i18n";

export class YoudaoCliMissingError extends Error {
	constructor(bin: string) {
		super(t("providers.cliNotFound", { provider: `youdaonote (${bin})` }));
		this.name = "YoudaoCliMissingError";
	}
}

export class YoudaoApiKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "YoudaoApiKeyError";
	}
}

function tryParseJson<T = unknown>(text: string): T | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed) as T;
	} catch {
		return null;
	}
}

function looksLikeApiKeyError(stderr: string): boolean {
	return /API Key|api[\s_-]?key/i.test(stderr) || stderr.includes("apiKey");
}

function readConfigApiKey(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const obj = data as Record<string, unknown>;
	if (typeof obj.apiKey === "string" && obj.apiKey.length > 0) return obj.apiKey;
	// Nested form: { backend: "mcp", mcp: { apiKey } }
	const backendKey = typeof obj.backend === "string" ? obj.backend : null;
	if (backendKey) {
		const nested = obj[backendKey];
		if (nested && typeof nested === "object") {
			const n = nested as Record<string, unknown>;
			if (typeof n.apiKey === "string" && n.apiKey.length > 0) return n.apiKey;
		}
	}
	for (const candidate of ["mcp", "http"]) {
		const nested = obj[candidate];
		if (nested && typeof nested === "object") {
			const n = nested as Record<string, unknown>;
			if (typeof n.apiKey === "string" && n.apiKey.length > 0) return n.apiKey;
		}
	}
	return null;
}

function readConfigServer(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const obj = data as Record<string, unknown>;
	if (typeof obj.server === "string" && obj.server.length > 0) return obj.server;
	const backendKey = typeof obj.backend === "string" ? obj.backend : null;
	if (backendKey) {
		const nested = obj[backendKey];
		if (nested && typeof nested === "object") {
			const n = nested as Record<string, unknown>;
			if (typeof n.server === "string" && n.server.length > 0) return n.server;
		}
	}
	return null;
}

interface YoudaoReadResult {
	content?: string;
	rawFormat?: string;
	isRaw?: boolean;
	title?: string;
	tags?: unknown;
}

export class YoudaoProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "edit";
	readonly capabilities: ProviderCapabilities = {
		canImport: true,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	constructor(private readonly config: YoudaoProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || "Youdao Note";
	}

	get binPath(): string {
		return this.config.cliPath?.trim() || "youdaonote";
	}

	available(): ProviderAvailability {
		if (!Platform.isDesktop) {
			return { ok: false, reason: t("providers.unavailable", { provider: t("brands.youdao") }) };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		this.assertDesktop();
		const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, "-").trim() || "Untitled";
		const payload: Record<string, unknown> = {
			title: `${safeTitle}.md`,
			type: "md",
			content: note.body,
		};
		if (this.config.defaultFolderId) payload.parentId = this.config.defaultFolderId;
		const payloadPath = await this.writeTempFile(JSON.stringify(payload), "json");
		try {
			const result = await runChild(this.binPath, ["save", "--json", "--file", payloadPath]);
			this.assertCliOk(result, "save");
			const parsed = tryParseJson<Record<string, unknown>>(result.stdout);
			const remoteId =
				typeof parsed?.fileId === "string"
					? parsed.fileId
					: typeof parsed?.id === "string"
						? parsed.id
						: "";
			return { remoteId };
		} finally {
			this.unlinkTempFile(payloadPath);
		}
	}

	async fetch(remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		this.assertDesktop();
		const result = await runChild(this.binPath, ["read", remoteId, "--json"]);
		this.assertCliOk(result, "read");
		const parsed = tryParseJson<YoudaoReadResult>(result.stdout) ?? {};
		const body = typeof parsed.content === "string" ? parsed.content : result.stdout.trim();
		const tags = Array.isArray(parsed.tags)
			? parsed.tags.filter((t): t is string => typeof t === "string")
			: [];
		return {
			remoteId,
			title: typeof parsed.title === "string" && parsed.title ? parsed.title : "Untitled Youdao Note",
			body,
			tags,
			attachments: [],
			sourceMeta: {
				source: "youdao",
				rawFormat: parsed.rawFormat ?? null,
				isRaw: parsed.isRaw ?? null,
			},
		};
	}

	async listRemote(opts?: ListOptions): Promise<RemoteListItem[]> {
		this.assertDesktop();
		const args = opts?.query
			? ["search", opts.query]
			: this.config.defaultFolderId
				? ["list", "-f", this.config.defaultFolderId]
				: ["list"];
		const result = await runChild(this.binPath, args);
		this.assertCliOk(result, "list");
		return parseYoudaoNotes(result.stdout);
	}

	/**
	 * List the user's notebook folders (root level) for the settings picker.
	 * Uses the CLI's default `list` output (v1.1.x has no `--json` on list),
	 * parsing only the `📁`-prefixed folder lines. Single-page fetch.
	 */
	async listFolders(): Promise<{ id: string; name: string }[]> {
		this.assertDesktop();
		const result = await runChild(this.binPath, ["list"]);
		this.assertCliOk(result, "list");
		return parseYoudaoFolders(result.stdout);
	}

	async delete(remoteId: string): Promise<void> {
		this.assertDesktop();
		const result = await runChild(this.binPath, ["delete", remoteId, "--json"]);
		this.assertCliOk(result, "delete");
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			this.assertDesktop();
			const result = await runChild(this.binPath, ["config", "show", "--json"]);
			if (result.code !== 0) {
				if (looksLikeApiKeyError(result.stderr)) {
					return {
						ok: false,
						message:
							"API key not configured. Paste a key above and click 'Save to CLI' (key from https://mopen.163.com).",
					};
				}
				return {
					ok: false,
					message: result.stderr.trim() || `youdaonote config show exited with ${result.code}`,
				};
			}
			const parsed = tryParseJson<Record<string, unknown>>(result.stdout);
			const apiKey = readConfigApiKey(parsed);
			if (!apiKey) {
				return {
					ok: false,
					message:
						"CLI runs, but no API key is configured. Paste a key above and click 'Save to CLI' " +
						"(key from https://mopen.163.com).",
				};
			}
			const server = readConfigServer(parsed);
			return {
				ok: true,
				message: server
					? `Connected to ${server} (apiKey ${apiKey})`
					: `CLI configured (apiKey ${apiKey})`,
			};
		} catch (err) {
			if (err instanceof CliMissingError || err instanceof YoudaoCliMissingError) {
				return { ok: false, message: err.message };
			}
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	async detectCli(): Promise<{ installed: boolean; version?: string; resolvedPath?: string; message?: string }> {
		try {
			this.assertDesktop();
			const resolvedPath = await whichBin(this.binPath);
			if (!resolvedPath) {
				return {
					installed: false,
					message:
						`Could not find '${this.binPath}' on PATH or common install locations ` +
						`(~/.local/bin, /usr/local/bin, /opt/homebrew/bin). ` +
						`If installed elsewhere, set the absolute path in the 'CLI binary' field above ` +
						`(e.g. ~/.local/bin/youdaonote).`,
				};
			}
			const result = await runChild(this.binPath, ["version"]);
			if (result.code === 0) {
				const text = result.stdout.trim() || result.stderr.trim();
				const versionMatch = text.match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?/);
				return {
					installed: true,
					version: versionMatch?.[0] ?? text,
					resolvedPath,
				};
			}
			return { installed: false, resolvedPath, message: result.stderr.trim() || "youdaonote version failed" };
		} catch (err) {
			if (err instanceof CliMissingError || err instanceof YoudaoCliMissingError) {
				return { installed: false, message: err.message };
			}
			return { installed: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	async setApiKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
		try {
			this.assertDesktop();
			const result = await runChild(this.binPath, ["config", "set", "apiKey", apiKey]);
			if (result.code === 0) return { ok: true, message: t("notices.apiKeySaved") };
			return { ok: false, message: result.stderr.trim() || `exited with ${result.code}` };
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	private assertDesktop(): void {
		if (!Platform.isDesktop) {
			throw new Error(t("providers.unavailable", { provider: t("brands.youdao") }));
		}
	}

	private assertCliOk(result: ChildResult, command: string): void {
		if (result.code === 0) return;
		const stderr = result.stderr.trim();
		if (looksLikeApiKeyError(stderr)) {
			throw new YoudaoApiKeyError(
				t("notices.apiKeyRequired"),
			);
		}
		throw new Error(stderr || `youdaonote ${command} exited with code ${result.code}`);
	}

	private async writeTempFile(body: string, ext: string = "md"): Promise<string> {
		const os = loadNodeModule<{ tmpdir(): string }>("os");
		const path = loadNodeModule<{ join(...parts: string[]): string }>("path");
		const fs = loadNodeModule<{ promises: { writeFile(p: string, data: string, encoding: string): Promise<void> } }>("fs");
		const tmpDir = os.tmpdir();
		const filePath = path.join(tmpDir, `aie-youdao-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
		await fs.promises.writeFile(filePath, body, "utf-8");
		return filePath;
	}

	private unlinkTempFile(filePath: string): void {
		try {
			const fs = loadNodeModule<{ unlinkSync(p: string): void }>("fs");
			fs.unlinkSync(filePath);
		} catch {
			// best-effort cleanup
		}
	}
}

/**
 * Parse the `youdaonote list`/`search` default text output into note
 * entries. Only `📄`-prefixed lines are notes (folders use `📁` and are
 * skipped). Each note line is `📄 <id>\t<title>.note`; falls back to a
 * whitespace split if the tab separator is absent. The trailing `.note`
 * extension is stripped from the title.
 */
function parseYoudaoNotes(stdout: string): RemoteListItem[] {
	const out: RemoteListItem[] = [];
	for (const raw of stdout.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line.startsWith("📄")) continue; // notes only; folders (📁) skipped
		const rest = line.replace(/^📄\s*/, "");
		const sep = rest.indexOf("\t");
		let id = "";
		let title = "";
		if (sep >= 0) {
			id = rest.slice(0, sep).trim();
			title = rest.slice(sep + 1).trim();
		} else {
			const m = rest.match(/^(\S+)\s+(.*)$/);
			id = m?.[1] ?? "";
			title = m?.[2] ?? "";
		}
		if (!id || !title) continue;
		if (title.toLowerCase().endsWith(".note")) title = title.slice(0, -".note".length);
		out.push({ remoteId: id, title });
	}
	return out;
}

/**
 * Parse the `youdaonote list` default text output into folder entries.
 * Only `📁`-prefixed lines are folders (notes use a different glyph).
 * Each folder line is `📁 <id>\t<name>`; falls back to whitespace split
 * if the tab separator is absent.
 */
function parseYoudaoFolders(stdout: string): { id: string; name: string }[] {
	const out: { id: string; name: string }[] = [];
	for (const raw of stdout.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line.startsWith("📁")) continue; // folders only; notes use a different glyph
		const rest = line.replace(/^📁\s*/, "");
		const sep = rest.indexOf("\t");
		let id = "";
		let name = "";
		if (sep >= 0) {
			id = rest.slice(0, sep).trim();
			name = rest.slice(sep + 1).trim();
		} else {
			const m = rest.match(/^(\S+)\s+(.*)$/);
			id = m?.[1] ?? "";
			name = m?.[2] ?? "";
		}
		if (id && name) out.push({ id, name });
	}
	return out;
}

export const youdaoFactory: ProviderFactory<YoudaoProviderConfig> = {
	kind: "youdao",
	create(config) {
		return new YoudaoProvider(config);
	},
};
