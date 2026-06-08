## Context

The Cross-App Notes Bridge plugin uses a provider architecture where each external note service implements the `Provider` interface (`src/providers/provider.ts`). Existing providers (Bear, WPS, Youdao, Flomo) each live in `src/providers/<name>/` and are registered via a `ProviderFactory` in `src/providers/factories.ts`.

The Yinxiang (印象笔记) skill documentation reveals a set of REST APIs hosted at `app.yinxiang.com/third/...` that support:
- Creating notes (`createNoteFromMCP`)
- Listing/searching notes (`searchNotesByFilter`)
- Listing notebooks (`listNoteBooks`)
- Fetching note details (`getNoteDetail`)

Authentication uses a token-based scheme (`auth: S=s...` header) obtained via OAuth at `https://app.yinxiang.com/third/skills-oauth/`.

## Goals / Non-Goals

**Goals:**
- Implement a `YinxiangProvider` that conforms to the existing `Provider` interface
- Support exporting Obsidian notes to Yinxiang with optional notebook selection
- Support importing notes from Yinxiang back to Obsidian (list + fetch)
- Provide OAuth authentication flow within the plugin settings UI
- Integrate Yinxiang into existing menus, commands, and settings following the established provider pattern

**Non-Goals:**
- Web clipper functionality (URL-based clipping) — out of scope for this bridge plugin
- Tag management (listing Yinxiang tags) — not needed for import/export
- Two-way sync or conflict resolution — one-shot export/import only
- Mobile-specific OAuth flows (we use the same external browser → protocol callback pattern as other providers)

## Decisions

### 1. OAuth via External Browser + Obsidian Protocol Callback
**Rationale**: Yinxiang's OAuth requires visiting `https://app.yinxiang.com/third/skills-oauth/` in a browser. The user copies the `S=s...` token and pastes it into the plugin settings. This mirrors the manual API key patterns used by Youdao and Flomo, rather than implementing a full OAuth2 redirect flow (which would require registering a custom redirect URI with Yinxiang).
**Alternative considered**: Full OAuth2 redirect with `obsidian://` protocol callback — rejected because Yinxiang's skill OAuth is designed for token copy-paste, not redirect-based authorization code flow.

### 2. Use `requestUrl` for API Calls
**Rationale**: Obsidian's `requestUrl` API handles CORS and works across desktop and mobile. The Yinxiang APIs are HTTPS JSON endpoints that fit this pattern perfectly.
**Alternative considered**: Node `https` module via `loadNodeModule` — rejected because it breaks mobile compatibility and is unnecessarily complex for simple REST calls.

### 3. Store Token in Provider Config
**Rationale**: The Yinxiang auth token will be stored as `apiKey` in the provider config (same pattern as Youdao/Flomo). This keeps auth state with the provider instance and persists via Obsidian's `saveData`/`loadData`.

### 4. Notebook Selection at Export Time
**Rationale**: Yinxiang supports specifying `notebookGuid` when creating a note. We will list notebooks via `listNoteBooks` API and present a picker (or allow setting a default notebook in settings), similar to how Youdao supports `defaultFolderId`.

### 5. Markdown → ENML Conversion for Push
**Rationale**: Yinxiang stores notes in ENML (Evernote Markup Language), a subset of XHTML. For the initial implementation, we will push plain text / simple HTML converted from Markdown. Complex Obsidian features (wikilinks, callouts, embeds) will be flattened to plain text or simple HTML.
**Trade-off**: This means some formatting may be lost. A future enhancement could add a full Markdown→ENML transformer.

## Risks / Trade-offs

- **[Risk] ENML format limitations** → Yinxiang may reject notes with unsupported HTML tags. **Mitigation**: Sanitize HTML to ENML-allowed tags (`<div>`, `<p>`, `<br>`, `<b>`, `<i>`, `<u>`, `<s>`, `<a>`, `<ul>`, `<ol>`, `<li>`, `<en-media>`). Strip or convert unsupported elements.
- **[Risk] Token expiry** → Yinxiang tokens may expire. **Mitigation**: Provide a "Re-authenticate" button in settings and surface auth errors clearly in the UI.
- **[Risk] API rate limits** → Yinxiang may throttle requests. **Mitigation**: Use the orchestrator's existing concurrency controls and add exponential backoff on 429 responses.
- **[Risk] Mobile OAuth UX** → Copy-pasting tokens on mobile is awkward. **Mitigation**: Use the same pattern as other providers; document the flow in README.

## Migration Plan

No migration needed — this is a pure addition. Users who don't configure Yinxiang will see no change.

## Open Questions

1. Should we support Yinxiang's sandbox/development environment for testing? (Likely no — use production API directly.)
2. Do we need to handle Yinxiang's `S=s` token refresh, or is it long-lived? (To be validated during implementation.)
