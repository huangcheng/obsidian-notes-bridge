# WeKnora Export Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WeKnora as a push-only export target that replicates the WeKnora browser extension's save pattern (custom API endpoint + API key + default knowledge base, markdown sent to `/knowledge-bases/{id}/knowledge/manual`).

**Architecture:** A new `src/providers/weknora/` provider package modeled on the existing Yinxiang provider (direct HTTP via Obsidian's `requestUrl`, API key in settings) and Flomo provider (push-only — `listRemote`/`fetch` throw). It plugs into the existing provider registry, settings cards, command palette, and the generic context-menu submenu with minimal edits to existing files. No new abstractions.

**Tech Stack:** TypeScript (strict), Obsidian plugin API (`requestUrl`, `Setting`, `Notice`, `FuzzySuggestModal`), esbuild bundle, `node --test` + `tsx` for unit tests, eslint.

**Spec:** `docs/superpowers/specs/2026-07-21-weknora-export-provider-design.md`

**WeKnora API recap (from spec):**
- Auth: `X-API-Key: <key>` header on every request. Long-lived key; no login/refresh.
- Base URL: user pastes full API base, e.g. `http://localhost:8080/api/v1`.
- `GET {base}/knowledge-bases` → `{ success, data: [{ id, name, type, ... }] }`.
- `POST {base}/knowledge-bases/{kb_id}/knowledge/manual` with `{ title, content, channel }` → `{ success, data: { id, parse_status: "pending", ... } }`. Async server-side parsing; no polling.
- Real HTTP status codes (not 200-with-code). Use `requestUrl({ throw: false })` and inspect `response.status`.

**Note on `requestUrl` semantics:** Obsidian's `requestUrl` throws for HTTP ≥400 by default. Pass `throw: false` to read `response.status` and map errors. Network/connection failures still throw even with `throw: false`, so wrap calls in try/catch.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/providers/weknora/types.ts` | Create | `WeknoraProviderConfig`, `DEFAULT_WEKNORA_CONFIG`, `WEKNORA_API_PATH`, API response types, `WEKNORA_TOKEN_HELP_URL` |
| `src/providers/weknora/helpers.ts` | Create | Pure, tested helpers: `normalizeWeknoraBaseUrl`, `describeWeknoraHttpError` |
| `src/providers/weknora/helpers.test.ts` | Create | Unit tests for the two helpers |
| `src/providers/weknora/weknora-provider.ts` | Create | `Provider` impl (push-only) + `weknoraFactory` |
| `src/ui/brand-names.ts` | Modify | Add `WEKNORA_NAME` |
| `src/providers/registry.ts` | Modify | Add `"weknora"` to `ProviderKind` union |
| `src/providers/factories.ts` | Modify | Register `weknoraFactory` |
| `src/settings/index.ts` | Modify | Add `WeknoraProviderConfig` to union + migration seed |
| `src/settings/settings-tab.ts` | Modify | Import + `renderProviderCard` case + `renderWeknoraProvider` card |
| `src/main.ts` | Modify | Import, command, `listWeknoraConfigs`, `pickWeknoraAndExport`, two union casts, `providerIcon` case |
| `src/i18n/locales/en.ts` | Modify | Add WeKnora keys |
| `src/i18n/locales/zh.ts` | Modify | Add WeKnora keys (parity required by `src/i18n.test.ts`) |

---

## Task 1: WeKnora types + pure helpers (TDD)

**Files:**
- Create: `src/providers/weknora/types.ts`
- Create: `src/providers/weknora/helpers.ts`
- Create: `src/providers/weknora/helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/providers/weknora/helpers.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { describeWeknoraHttpError, normalizeWeknoraBaseUrl } from "./helpers";

test("normalizeWeknoraBaseUrl passes through a clean URL", () => {
	assert.equal(
		normalizeWeknoraBaseUrl("http://localhost:8080/api/v1"),
		"http://localhost:8080/api/v1",
	);
});

test("normalizeWeknoraBaseUrl strips trailing slashes", () => {
	assert.equal(
		normalizeWeknoraBaseUrl("http://localhost:8080/api/v1///"),
		"http://localhost:8080/api/v1",
	);
});

test("normalizeWeknoraBaseUrl trims surrounding whitespace", () => {
	assert.equal(
		normalizeWeknoraBaseUrl("   https://demo.example.com/api/v1  "),
		"https://demo.example.com/api/v1",
	);
});

test("normalizeWeknoraBaseUrl returns empty string for empty input", () => {
	assert.equal(normalizeWeknoraBaseUrl(""), "");
	assert.equal(normalizeWeknoraBaseUrl("   "), "");
});

test("describeWeknoraHttpError maps 401 to auth message", () => {
	assert.equal(
		describeWeknoraHttpError(401, null),
		"WeKnora rejected the API key.",
	);
});

test("describeWeknoraHttpError maps 403 to scope message", () => {
	assert.equal(
		describeWeknoraHttpError(403, null),
		"API key lacks permission (needs full access or the ingest capability, and access to this knowledge base).",
	);
});

test("describeWeknoraHttpError maps 404 to missing knowledge base", () => {
	assert.equal(
		describeWeknoraHttpError(404, null),
		"Knowledge base not found.",
	);
});

test("describeWeknoraHttpError maps 409 to duplicate", () => {
	assert.equal(
		describeWeknoraHttpError(409, { code: 1005 }),
		"Document already exists in this knowledge base.",
	);
});

test("describeWeknoraHttpError maps 413 to too large", () => {
	assert.equal(
		describeWeknoraHttpError(413, null),
		"Note is too large for the WeKnora server limit.",
	);
});

test("describeWeknoraHttpError maps 429 to rate limit", () => {
	assert.equal(
		describeWeknoraHttpError(429, null),
		"WeKnora rate-limited the request.",
	);
});

test("describeWeknoraHttpError maps 5xx to server error with status", () => {
	assert.equal(
		describeWeknoraHttpError(502, null),
		"WeKnora server error (status 502).",
	);
});

test("describeWeknoraHttpError maps unknown 4xx to generic with status", () => {
	assert.equal(
		describeWeknoraHttpError(418, null),
		"WeKnora request failed (status 418).",
	);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './helpers'` (and `./types` referenced by helpers later).

- [ ] **Step 3: Create the types file**

Create `src/providers/weknora/types.ts`:

```ts
import { ProviderConfigBase } from "../registry";

/**
 * WeKnora provider configuration. Mirrors the browser extension's
 * "enterprise/developer mode" connection: a full API base URL plus a
 * long-lived API key. The target knowledge base ("wiki folder") is
 * chosen once in settings.
 */
export interface WeknoraProviderConfig extends ProviderConfigBase {
	kind: "weknora";
	/** Full API base, e.g. http://localhost:8080/api/v1 */
	baseUrl?: string;
	/** Long-lived API key (X-API-Key). Created in WeKnora web UI → Settings → Integrations → API. */
	apiKey?: string;
	/** Default knowledge base id for exports. */
	knowledgeBaseId?: string;
	/** Default knowledge base display name (kept for a readable settings card when offline). */
	knowledgeBaseName?: string;
}

export const DEFAULT_WEKNORA_CONFIG: Omit<WeknoraProviderConfig, "id" | "displayName"> = {
	kind: "weknora",
	enabled: true,
};

/** Path suffix every WeKnora server exposes. The base URL already includes it. */
export const WEKNORA_API_PATH = "/api/v1";

/** Label sent with each ingest so WeKnora analytics can attribute the source. */
export const WEKNORA_CHANNEL = "obsidian";

/** Where to send users to create an API key. */
export const WEKNORA_TOKEN_HELP_URL = "https://github.com/Tencent/WeKnora";

/** GET /knowledge-bases response item. */
export interface WeknoraKnowledgeBase {
	id: string;
	name: string;
	type: "document" | "faq" | "wiki";
	description?: string;
}

export interface WeknoraKnowledgeBaseListResponse {
	success?: boolean;
	data?: WeknoraKnowledgeBase[];
}

/** POST /knowledge-bases/{id}/knowledge/manual response. */
export interface WeknoraManualResponse {
	success?: boolean;
	data?: {
		id?: string;
		parse_status?: string;
		title?: string;
	};
}
```

- [ ] **Step 4: Create the helpers module**

Create `src/providers/weknora/helpers.ts`:

```ts
/**
 * Normalize a user-entered WeKnora API base URL: trim surrounding
 * whitespace and strip trailing slashes. The user pastes the full base
 * including `/api/v1` (same string the browser extension asks for), so
 * we do not append or rewrite the path — only tidy it.
 */
export function normalizeWeknoraBaseUrl(raw: string): string {
	return raw.trim().replace(/\/+$/, "");
}

/**
 * Map a WeKnora HTTP failure (status + parsed/unknown body) to a
 * concrete user-facing message. The body is currently unused because
 * WeKnora's status codes are authoritative, but it is accepted so the
 * provider can forward richer errors later without changing call sites.
 */
export function describeWeknoraHttpError(status: number, _body: unknown): string {
	switch (status) {
		case 401:
			return "WeKnora rejected the API key.";
		case 403:
			return "API key lacks permission (needs full access or the ingest capability, and access to this knowledge base).";
		case 404:
			return "Knowledge base not found.";
		case 409:
			return "Document already exists in this knowledge base.";
		case 413:
			return "Note is too large for the WeKnora server limit.";
		case 429:
			return "WeKnora rate-limited the request.";
		default:
			if (status >= 500) return `WeKnora server error (status ${status}).`;
			return `WeKnora request failed (status ${status}).`;
	}
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all helper tests green.

- [ ] **Step 6: Commit**

```bash
git add src/providers/weknora/types.ts src/providers/weknora/helpers.ts src/providers/weknora/helpers.test.ts
git commit -m "feat(weknora): add config types and URL/error helpers with tests"
```

---

## Task 2: WeknoraProvider + factory

**Files:**
- Create: `src/providers/weknora/weknora-provider.ts`
- Modify: `src/providers/factories.ts`

- [ ] **Step 1: Create the provider**

Create `src/providers/weknora/weknora-provider.ts`:

```ts
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
	WeknoraKnowledgeBase,
	WeknoraKnowledgeBaseListResponse,
	WeknoraManualResponse,
	WeknoraProviderConfig,
	WEKNORA_CHANNEL,
} from "./types";
import { describeWeknoraHttpError, normalizeWeknoraBaseUrl } from "./helpers";

/**
 * Push-only provider for a WeKnora (https://github.com/Tencent/WeKnora)
 * server. Replicates the browser extension's save pattern: authenticate
 * with a long-lived API key (X-API-Key) against a user-configured base
 * URL, and save Markdown notes via the `/knowledge/manual` ingest
 * endpoint. Read paths (fetch / listRemote) are unsupported.
 */
export class WeknoraProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "database";
	readonly capabilities: ProviderCapabilities = {
		canImport: false,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	constructor(private readonly config: WeknoraProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || t("brands.weknora");
	}

	available(): ProviderAvailability {
		if (!this.config.baseUrl?.trim() || !this.config.apiKey?.trim() || !this.config.knowledgeBaseId?.trim()) {
			return { ok: false, reason: t("providers.enableInSettings") };
		}
		return { ok: true };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		const { base, key, kbId } = this.requireConfig();
		const title = note.title.trim() || "Untitled";

		let response;
		try {
			response = await requestUrl({
				url: `${base}/knowledge-bases/${encodeURIComponent(kbId)}/knowledge/manual`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": key,
				},
				body: JSON.stringify({
					title,
					content: note.body,
					channel: WEKNORA_CHANNEL,
				}),
				throw: false,
			});
		} catch (err) {
			throw new Error(t("providers.weknoraUnreachable"));
		}

		if (response.status < 200 || response.status >= 300) {
			throw new Error(describeWeknoraHttpError(response.status, safeJson(response)));
		}

		const result = (response.json || {}) as WeknoraManualResponse;
		if (result.success === false) {
			throw new Error(t("providers.weknoraCreateFailed"));
		}
		return { remoteId: result.data?.id ?? "" };
	}

	async fetch(_remoteId: string, _opts?: FetchOptions): Promise<NormalizedNote> {
		throw new Error(t("providers.weknoraReadUnsupported"));
	}

	async listRemote(_opts?: ListOptions): Promise<RemoteListItem[]> {
		throw new Error(t("providers.weknoraReadUnsupported"));
	}

	/**
	 * List knowledge bases for the configured endpoint/key. Used by the
	 * settings card's "refresh" button to populate the knowledge-base
	 * picker. Returns only what the API returns (already scoped to the
	 * key's allowed KBs).
	 */
	async listKnowledgeBases(): Promise<WeknoraKnowledgeBase[]> {
		const { base, key } = this.requireConfig();
		let response;
		try {
			response = await requestUrl({
				url: `${base}/knowledge-bases`,
				method: "GET",
				headers: { "X-API-Key": key },
				throw: false,
			});
		} catch (err) {
			throw new Error(t("providers.weknoraUnreachable"));
		}
		if (response.status < 200 || response.status >= 300) {
			throw new Error(describeWeknoraHttpError(response.status, safeJson(response)));
		}
		const result = (response.json || {}) as WeknoraKnowledgeBaseListResponse;
		return result.data ?? [];
	}

	async testConnection(): Promise<{ ok: boolean; message?: string }> {
		try {
			const kbs = await this.listKnowledgeBases();
			return {
				ok: true,
				message: `${t("providers.connectionSuccess")} — ${kbs.length} knowledge base(s)`,
			};
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	dispose(): void {
		// No long-lived resources (no MCP client, no subprocess).
	}

	private requireConfig(): { base: string; key: string; kbId: string } {
		const base = normalizeWeknoraBaseUrl(this.config.baseUrl ?? "");
		const key = this.config.apiKey?.trim() ?? "";
		const kbId = this.config.knowledgeBaseId?.trim() ?? "";
		if (!base || !key || !kbId) {
			throw new Error(t("providers.weknoraIncompleteConfig"));
		}
		return { base, key, kbId };
	}
}

function safeJson(response: { json?: unknown }): unknown {
	try {
		return response.json ?? undefined;
	} catch {
		return undefined;
	}
}

export const weknoraFactory: ProviderFactory<WeknoraProviderConfig> = {
	kind: "weknora",
	create(config) {
		return new WeknoraProvider(config);
	},
};
```

- [ ] **Step 2: Register the factory**

Modify `src/providers/factories.ts` — add the import and the registration call. Replace the file body with:

```ts
import { bearFactory } from "./bear/bear-provider";
import { flomoFactory } from "./flomo/flomo-provider";
import { ProviderRegistry } from "./registry";
import { weknoraFactory } from "./weknora/weknora-provider";
import { wpsFactory } from "./wps/wps-provider";
import { youdaoFactory } from "./youdao/youdao-provider";
import { yinxiangFactory } from "./yinxiang/yinxiang-provider";

/**
 * Register every built-in provider factory with the supplied registry.
 * Called once during plugin onload.
 */
export function registerAllFactories(registry: ProviderRegistry): void {
	registry.registerFactory(bearFactory);
	registry.registerFactory(wpsFactory);
	registry.registerFactory(youdaoFactory);
	registry.registerFactory(flomoFactory);
	registry.registerFactory(yinxiangFactory);
	registry.registerFactory(weknoraFactory);
}
```

- [ ] **Step 3: Add the WeKnora i18n keys referenced by the provider**

These strings are imported by the provider via `t(...)`, so they must exist before the build will compile. Full locale edits happen in Task 4; add the keys now to both locales to keep `src/i18n.test.ts` (key parity) green.

In `src/i18n/locales/en.ts`, inside the `providers` block (after the existing `yinxiangIntro` entry), add:

```ts
	weknoraUnreachable: "Could not reach the WeKnora server.",
	weknoraCreateFailed: "WeKnora accepted the request but reported failure.",
	weknoraReadUnsupported: "WeKnora does not support reading notes back.",
	weknoraIncompleteConfig: "Configure API URL, API key, and a knowledge base in settings first.",
```

In `src/i18n/locales/zh.ts`, inside the `providers` block, add the parity keys:

```ts
	weknoraUnreachable: "无法连接到 WeKnora 服务器。",
	weknoraCreateFailed: "WeKnora 已接收请求但返回失败。",
	weknoraReadUnsupported: "WeKnora 不支持回读笔记。",
	weknoraIncompleteConfig: "请先在设置中填写 API 地址、API 密钥和知识库。",
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including the existing `src/i18n.test.ts` parity check).

- [ ] **Step 6: Commit**

```bash
git add src/providers/weknora/weknora-provider.ts src/providers/factories.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts
git commit -m "feat(weknora): add push-only provider and register factory"
```

---

## Task 3: Registry + settings union + migration seed

**Files:**
- Modify: `src/providers/registry.ts:3`
- Modify: `src/settings/index.ts`

- [ ] **Step 1: Add "weknora" to the ProviderKind union**

In `src/providers/registry.ts`, change line 3 from:

```ts
export type ProviderKind = "cli" | "mcp" | "http" | "bear" | "wps" | "youdao" | "flomo" | "yinxiang";
```

to:

```ts
export type ProviderKind = "cli" | "mcp" | "http" | "bear" | "wps" | "youdao" | "flomo" | "yinxiang" | "weknora";
```

- [ ] **Step 2: Wire WeknoraProviderConfig into the settings union and migration**

Modify `src/settings/index.ts`.

Add the import (next to the other provider type imports near the top):

```ts
import { DEFAULT_WEKNORA_CONFIG, WeknoraProviderConfig } from "../providers/weknora/types";
```

Extend the `ProviderConfig` union (insert `WeknoraProviderConfig` before `ProviderConfigBase`):

```ts
export type ProviderConfig =
	| BearProviderConfig
	| WpsProviderConfig
	| YoudaoProviderConfig
	| FlomoProviderConfig
	| YinxiangProviderConfig
	| WeknoraProviderConfig
	| ProviderConfigBase;
```

Add the migration seed at the end of `applyDefaultProviderMigration` (after the yinxiang block):

```ts
	if (!settings.providers.some((p) => p.kind === "weknora")) {
		const cfg: WeknoraProviderConfig = {
			id: "weknora",
			displayName: "WeKnora",
			...DEFAULT_WEKNORA_CONFIG,
		};
		settings.providers.push(cfg);
	}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/providers/registry.ts src/settings/index.ts
git commit -m "feat(weknora): add kind, settings union, and default migration seed"
```

---

## Task 4: Settings card UI + i18n

**Files:**
- Modify: `src/ui/brand-names.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`

- [ ] **Step 1: Add the WEKNORA_NAME brand constant**

In `src/ui/brand-names.ts`, add after `YINXIANG_NAME`:

```ts
export const WEKNORA_NAME = "WeKnora";
```

- [ ] **Step 2: Add the i18n keys**

In `src/i18n/locales/en.ts`:

- In `commands` (next to `sendToYinxiang`):

```ts
		sendToWeknora: "Send active note to WeKnora…",
```

- In `settings.labels` (next to `apiToken`):

```ts
		apiUrl: "API URL",
		knowledgeBase: "Knowledge base",
```

- In `settings.descriptions` (next to `apiToken`):

```ts
		weknoraApiUrl: "Full API base including /api/v1, e.g. http://localhost:8080/api/v1.",
		weknoraApiKey: "Stored locally. Sent as the X-API-Key header on every request.",
		weknoraKnowledgeBase: "Default knowledge base for exports. Click Refresh to load the list from the server.",
```

- In `settings.buttons` (next to `test`):

```ts
		refresh: "Refresh",
```

- In `providers` (next to `getYinxiangToken`):

```ts
		weknoraIntro:
			"Export notes to a self-hosted or cloud {{provider}} instance via its REST API. Create an API key in WeKnora → Settings → Integrations → API with full access or the ingest capability.",
		getWeknoraToken: "Open WeKnora on GitHub",
		weknoraNoKb: "No knowledge base selected. Enter API URL + API key, then click Refresh.",
```

- In `brands` (next to `yinxiang`):

```ts
		weknora: "WeKnora",
```

In `src/i18n/locales/zh.ts`, add the parity keys:

- `commands`:

```ts
		sendToWeknora: "发送活动笔记到 WeKnora…",
```

- `settings.labels`:

```ts
		apiUrl: "API 地址",
		knowledgeBase: "知识库",
```

- `settings.descriptions`:

```ts
		weknoraApiUrl: "完整 API 地址（含 /api/v1），例如 http://localhost:8080/api/v1。",
		weknoraApiKey: "仅在本地存储。每次请求以 X-API-Key 头发送。",
		weknoraKnowledgeBase: "导出默认知识库。点击「刷新」从服务器加载列表。",
```

- `settings.buttons`:

```ts
		refresh: "刷新",
```

- `providers`:

```ts
		weknoraIntro:
			"通过 REST API 将笔记导出到自托管或云端 {{provider}} 实例。请在 WeKnora → 设置 → 集成 → API 创建具备完全访问或 ingest 权限的 API 密钥。",
		getWeknoraToken: "在 GitHub 上打开 WeKnora",
		weknoraNoKb: "尚未选择知识库。请先填写 API 地址与 API 密钥，再点击「刷新」。",
```

- `brands`:

```ts
		weknora: "WeKnora",
```

- [ ] **Step 3: Wire the settings-card dispatch**

In `src/settings/settings-tab.ts`:

Add imports near the top (alongside the existing provider imports). `Setting`, `Notice`, and `t` are already imported by the other cards — do not re-import them. Add only these new symbols:

```ts
import { WeknoraProvider } from "../providers/weknora/weknora-provider";
import { WEKNORA_TOKEN_HELP_URL, WeknoraProviderConfig } from "../providers/weknora/types";
import { WEKNORA_NAME } from "../ui/brand-names";
```

Add a case to the `renderProviderCard` switch (before the `default` case):

```ts
			case "weknora":
				this.renderWeknoraProvider(containerEl, config as WeknoraProviderConfig);
				return;
```

- [ ] **Step 4: Implement renderWeknoraProvider**

Add this method to the `AdvancedImportExportSettingTab` class (e.g. immediately after `renderYinxiangProvider`):

```ts
	private renderWeknoraProvider(parentEl: HTMLElement, config: WeknoraProviderConfig): void {
		const containerEl = this.openCollapsibleCard(
			parentEl,
			config.displayName || t("brands.weknora"),
			config,
		);
		const intro = containerEl.createEl("p");
		intro.appendText(t("providers.weknoraIntro", { provider: WEKNORA_NAME }) + " ");
		intro
			.createEl("a", {
				text: t("providers.getWeknoraToken"),
				href: WEKNORA_TOKEN_HELP_URL,
			})
			.setAttr("target", "_blank");

		new Setting(containerEl).setName(t("settings.labels.displayName")).addText((text) =>
			text.setValue(config.displayName).onChange(async (v) => {
				config.displayName = v.trim() || t("brands.weknora");
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.apiUrl"))
			.setDesc(t("settings.descriptions.weknoraApiUrl"))
			.addText((text) => {
				text.setPlaceholder("http://localhost:8080/api/v1");
				text.setValue(config.baseUrl ?? "");
				text.inputEl.type = "text";
				text.onChange(async (v) => {
					config.baseUrl = v.trim() || undefined;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("settings.labels.apiKey"))
			.setDesc(t("settings.descriptions.weknoraApiKey"))
			.addText((text) => {
				text.inputEl.type = "password";
				text.setValue(config.apiKey ?? "").onChange(async (v) => {
					config.apiKey = v.trim() || undefined;
					await this.plugin.saveSettings();
				});
			});

		const kbSetting = new Setting(containerEl)
			.setName(t("settings.labels.knowledgeBase"))
			.setDesc(t("settings.descriptions.weknoraKnowledgeBase"));
		const selectEl = kbSetting.controlEl.createEl("select");
		const placeholder = document.createElement("option");
		placeholder.value = "";
		placeholder.text = config.knowledgeBaseName || t("providers.weknoraNoKb");
		selectEl.appendChild(placeholder);
		selectEl.value = config.knowledgeBaseId ?? "";
		selectEl.addEventListener("change", async () => {
			const id = selectEl.value;
			const name = selectEl.selectedOptions[0]?.text ?? "";
			config.knowledgeBaseId = id || undefined;
			config.knowledgeBaseName = id ? name : undefined;
			await this.plugin.saveSettings();
		});
		kbSetting.addButton((btn) =>
			btn.setButtonText(t("settings.buttons.refresh")).onClick(async () => {
				const provider = this.plugin.registry.get(config.id) as WeknoraProvider | null;
				if (!provider) {
					new Notice(t("providers.notEnabled"));
					return;
				}
				const notice = new Notice(t("notices.connectionTesting"), 0);
				try {
					const kbs = await provider.listKnowledgeBases();
					while (selectEl.options.length > 0) selectEl.remove(0);
					if (kbs.length === 0) {
						const opt = document.createElement("option");
						opt.value = "";
						opt.text = t("providers.weknoraNoKb");
						selectEl.appendChild(opt);
					} else {
						for (const kb of kbs) {
							const opt = document.createElement("option");
							opt.value = kb.id;
							opt.text = `${kb.name} (${kb.type})`;
							selectEl.appendChild(opt);
						}
						if (config.knowledgeBaseId && kbs.some((k) => k.id === config.knowledgeBaseId)) {
							selectEl.value = config.knowledgeBaseId;
						}
					}
					notice.hide();
					new Notice(`${t("notices.connectionSuccess")} — ${kbs.length}`);
				} catch (err) {
					notice.hide();
					new Notice(err instanceof Error ? err.message : String(err));
				}
			}),
		);

		new Setting(containerEl).setName(t("settings.labels.enabled")).addToggle((tog) =>
			tog.setValue(config.enabled).onChange(async (v) => {
				config.enabled = v;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.testConnection"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.test")).onClick(async () => {
					const provider = this.plugin.registry.get(config.id) as WeknoraProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const notice = new Notice(t("notices.connectionTesting"), 0);
					const result = await provider.testConnection?.();
					notice.hide();
					new Notice(result?.message ?? (result?.ok ? t("notices.connectionSuccess") : t("notices.connectionFailed")));
				}),
			);
	}
```

- [ ] **Step 5: Build, lint, and test**

Run: `npm run build && npm run lint && npm test`
Expected: all green (TS compiles, eslint clean, tests pass including i18n parity).

- [ ] **Step 6: Commit**

```bash
git add src/ui/brand-names.ts src/settings/settings-tab.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts
git commit -m "feat(weknora): add settings card with live knowledge-base picker"
```

---

## Task 5: Command palette + context-menu wiring

**Files:**
- Modify: `src/main.ts`

> The context-menu submenu is generic: `populateSubmenu` already adds an "Export note to {displayName}" item for every enabled, available, non-Bear provider (see `src/main.ts:428-458`). WeKnora will appear there automatically once registered. The only `main.ts` edits are: the command, the config list/pick helpers, the two union-type casts (lines 450 and 543), the icon switch (line 640), and imports.

- [ ] **Step 1: Add imports**

In `src/main.ts`, alongside the existing provider-config imports near the top, add:

```ts
import { WeknoraProviderConfig } from "./providers/weknora/types";
```

And alongside the existing brand-name imports, add `WEKNORA_NAME`:

```ts
import { FLOMO_NAME, WPS_NAME, YOUDAO_NAME, YINXIANG_NAME, WEKNORA_NAME } from "./ui/brand-names";
```

- [ ] **Step 2: Register the command**

Immediately after the `export-active-to-yinxiang` command block (around line 176–184), add:

```ts
		this.addCommand({
			id: "export-active-to-weknora",
			name: t("commands.sendToWeknora"),
			checkCallback: (checking) => {
				if (this.listWeknoraConfigs().length === 0) return false;
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.pickWeknoraAndExport(sel.notes);
				return true;
			},
		});
```

- [ ] **Step 3: Add listWeknoraConfigs + pickWeknoraAndExport**

Immediately after `pickYinxiangAndExport` (around line 532), add:

```ts
	private listWeknoraConfigs(): WeknoraProviderConfig[] {
		return this.settings.providers.filter(
			(p): p is WeknoraProviderConfig => p.kind === "weknora" && p.enabled !== false,
		);
	}

	private async pickWeknoraAndExport(files: TFile[]): Promise<void> {
		const configs = this.listWeknoraConfigs();
		if (configs.length === 0) {
			new Notice(t("notices.noProviderConfigured", { provider: WEKNORA_NAME }));
			return;
		}
		const target = configs.length === 1 ? configs[0]! : await this.pickProviderConfig(configs, t("notices.selectProvider", { provider: WEKNORA_NAME }));
		if (!target) return;
		await this.exportToProvider(target, files);
	}
```

- [ ] **Step 4: Extend the exportToProvider union type**

In `src/main.ts`, the `exportToProvider` signature appears **twice** as a type union — once in the submenu onClick cast (~line 450) and once in the method signature (~line 543). Add `WeknoraProviderConfig` to both.

At ~line 450, change:

```ts
await this.exportToProvider(config as WpsProviderConfig | YoudaoProviderConfig | FlomoProviderConfig | YinxiangProviderConfig, files);
```

to:

```ts
await this.exportToProvider(config as WpsProviderConfig | YoudaoProviderConfig | FlomoProviderConfig | YinxiangProviderConfig | WeknoraProviderConfig, files);
```

At ~line 543, change the method signature from:

```ts
		config: WpsProviderConfig | YoudaoProviderConfig | FlomoProviderConfig | YinxiangProviderConfig,
```

to:

```ts
		config: WpsProviderConfig | YoudaoProviderConfig | FlomoProviderConfig | YinxiangProviderConfig | WeknoraProviderConfig,
```

- [ ] **Step 5: Add the icon case**

In the `providerIcon` function (~line 640), add a `weknora` case:

```ts
function providerIcon(kind: string): string {
	switch (kind) {
		case "wps": return "file-text";
		case "youdao": return "edit";
		case "flomo": return "notebook-pen";
		case "yinxiang": return "book-marked";
		case "weknora": return "database";
		default: return "export";
	}
}
```

- [ ] **Step 6: Build, lint, and test**

Run: `npm run build && npm run lint && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat(weknora): add export command and wire context-menu/icon"
```

---

## Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Clean production build**

Run: `npm run build`
Expected: `tsc -noEmit -skipLibCheck` passes and esbuild writes `main.js`. No errors.

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: eslint reports no errors or warnings in the new/changed files.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all tests pass, including `src/i18n.test.ts` (en/zh parity) and the new `src/providers/weknora/helpers.test.ts`.

- [ ] **Step 4: Manual smoke test**

Copy `main.js`, `manifest.json`, and `styles.css` (if present) into `<Vault>/.obsidian/plugins/advanced-import-export/`, reload Obsidian, enable the plugin, then:

1. In WeKnora web UI, create an API key with `full_access` (or `ingest` capability + the target knowledge base in its allow-list). Copy the API URL (e.g. `http://localhost:8080/api/v1`) and the key.
2. In the plugin settings, open the **WeKnora** card. Paste the API URL and API key.
3. Click **Refresh** next to Knowledge base; confirm the dropdown populates with your knowledge bases. Select one.
4. Click **Test connection**; confirm a success notice with the KB count.
5. Open a note and run the **Send active note to WeKnora…** command. Confirm a success notice.
6. In WeKnora, open the target knowledge base and confirm the note appears with the correct title and markdown body.
7. Right-click a note in the file explorer; confirm an **Export note to WeKnora** submenu item appears and works.
8. Negative test: change the API key to garbage, click **Test connection**; confirm the "WeKnora rejected the API key." message.

- [ ] **Step 5: (Optional) Bump version**

If releasing, bump `manifest.json` `version` (SemVer — this is a minor feature, e.g. `0.1.7` → `0.2.0`), update `versions.json`, and tag the release per `AGENTS.md`.

---

## Out of scope (per spec)

Import from WeKnora; multipart `/knowledge/file` upload and attachments; per-export KB picker; wiki sub-folder APIs; parse-status polling; in-plugin API-key creation.
