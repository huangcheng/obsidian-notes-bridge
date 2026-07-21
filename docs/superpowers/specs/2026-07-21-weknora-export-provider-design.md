# WeKnora Export Provider — Design

Date: 2026-07-21
Status: Approved (design), pending implementation plan

## Summary

Add WeKnora (https://github.com/Tencent/WeKnora) as a push-only export target, replicating the save pattern of the WeKnora browser extension: user configures a custom (self-hosted) API endpoint and an API key, picks a default knowledge base ("wiki folder") in settings, and exports Obsidian notes into that knowledge base via the plugin's existing provider architecture.

## Decisions (from brainstorming)

- **Direction:** export client to WeKnora only. No import from WeKnora.
- **Target knowledge base:** configured as a default per WeKnora config in settings; no per-export picker.
- **Ingest endpoint:** `POST /knowledge-bases/{id}/knowledge/manual` (JSON markdown), not multipart file upload.

## WeKnora API contract (verified against server source)

- **Base URL:** user pastes the full API base, e.g. `http://host:8080/api/v1` (same string the browser extension asks for).
- **Auth:** long-lived API key sent as `X-API-Key: <key>` header on every request. No login/JWT/refresh flow. Key needs `full_access` or the `ingest` capability (created in WeKnora web UI → Settings → Integrations → API).
- **List knowledge bases:** `GET {base}/knowledge-bases` → `{ success, data: [{ id, name, type, ... }] }` (`type` is `document` | `faq` | `wiki`).
- **Save markdown:** `POST {base}/knowledge-bases/{kb_id}/knowledge/manual` with JSON body `{ title, content, channel }`. Response: `{ success, data: { id, parse_status: "pending", ... } }`. Parsing/chunking/embedding is async and server-side; the plugin does not poll.
- **Errors:** non-2xx responses carry a JSON envelope `{ code, ... }`. Relevant mappings: 401 unauthorized, 403 forbidden (key scope), 409 conflict (duplicate document), 413 too large (`MAX_FILE_SIZE_MB`), network failure.
- Do **not** send `X-Tenant-ID` (API key is intrinsically tenant-scoped).
- `channel` is a free-form analytics label; the plugin sends `"obsidian"` (the extension uses `"browser_extension"`).

## Architecture

New provider package `src/providers/weknora/`, modeled on the Yinxiang provider (direct HTTP via Obsidian `requestUrl`, API key stored in `data.json`) and Flomo (push-only):

| File | Responsibility |
|---|---|
| `src/providers/weknora/types.ts` | `WeknoraProviderConfig extends ProviderConfigBase`: `{ kind: "weknora", baseUrl: string, apiKey: string, knowledgeBaseId: string, knowledgeBaseName: string }` |
| `src/providers/weknora/weknora-provider.ts` | `Provider` implementation: `push()`, `testConnection()`, `listKnowledgeBases()` (used by settings), `dispose()`. `listRemote()`/`fetch()` throw "not supported" like Flomo. |
| `src/providers/weknora/factory.ts` | Factory registered in `src/providers/factories.ts`. |

Integration points (existing files, minimal edits):

- `src/settings/index.ts` — extend `ProviderConfig` union with `WeknoraProviderConfig`.
- `src/providers/factories.ts` — register the WeKnora factory.
- `src/settings/settings-tab.ts` — new `renderWeknoraProvider` card dispatched from `renderProviderCard()`.
- `src/main.ts` — register `export-active-to-weknora` command and context-menu entries following the existing per-kind dispatch pattern.
- `src/i18n/locales/en.ts`, `zh.ts` — strings for card labels, notices, errors.

## Settings card UX

One collapsible card per WeKnora config, consistent with existing provider cards:

- **API URL** text field (placeholder `http://localhost:8080/api/v1`).
- **API key** password-style text field; stored in plugin `data.json`.
- **Knowledge base** dropdown + refresh button. Refresh calls `listKnowledgeBases()` with the current URL/key and populates the dropdown (`name` shown, `id` stored). Stores both `knowledgeBaseId` and `knowledgeBaseName` so the card stays readable if the server is unreachable later.
- **Test connection** button → `testConnection()` (GET knowledge-bases); shows success/failure notice.
- **Enabled** toggle and delete, same as other cards.

Multiple WeKnora configs are supported (the providers array and config picker already handle this).

## Export flow

Reuses the existing command-path export in `main.ts` unchanged in behavior:

1. Command `export-active-to-weknora` (plus file/multi-file context-menu entries) collects target files via the existing selection builders.
2. If multiple enabled WeKnora configs exist, the existing `FuzzySuggestModal` config picker runs.
3. Each file is read and run through `MarkdownTransformer` with the user's transform settings.
4. `provider.push()` builds a `NormalizedNote` (title from filename, body = transformed markdown, tags from frontmatter) and POSTs `{ title, content: body, channel: "obsidian" }` to `{baseUrl}/knowledge-bases/{knowledgeBaseId}/knowledge/manual` via `requestUrl`.
5. Existing success/failure `Notice` summarises the run.

## Error handling

`push()` and `testConnection()` map failures to friendly notices:

| Condition | User-facing message |
|---|---|
| Missing `baseUrl` / `apiKey` / `knowledgeBaseId` | "Configure API URL, API key, and knowledge base in settings first." |
| HTTP 401 | "WeKnora rejected the API key." |
| HTTP 403 | "API key lacks permission (needs full access or the ingest capability, and access to this knowledge base)." |
| HTTP 409 | "Document already exists in this knowledge base." (counts as failure in the summary notice) |
| HTTP 413 | "Note is too large for the WeKnora server limit." |
| Network error / unreachable | "Could not reach the WeKnora server." |

## Testing

- `npm run build` passes; eslint clean on changed files.
- Manual: create an API key (ingest capability) on a self-hosted WeKnora, configure the card, refresh + select a knowledge base, test connection, export a note, confirm it appears in the knowledge base with the right title/content.

## Out of scope (YAGNI)

- Import from WeKnora (`listRemote`/`fetch`).
- Multipart file upload (`/knowledge/file`) and attachments.
- Per-export knowledge-base picker.
- Wiki sub-folder APIs.
- Parse-status polling (`GET /knowledge/{id}`).
- API-key creation from the plugin.
