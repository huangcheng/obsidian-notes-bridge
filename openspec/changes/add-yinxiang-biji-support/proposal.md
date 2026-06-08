## Why

The Cross-App Notes Bridge plugin currently supports Bear, WPS Cloud Note, Youdao Note, and Flomo. Users have requested integration with **Yinxiang (印象笔记)**, the China-localized Evernote service, which remains one of the most popular note-taking platforms in the Chinese market. Adding Yinxiang support will allow users to export Obsidian notes directly to their Yinxiang account and optionally import notes back, completing the bridge coverage for major Chinese note platforms.

## What Changes

- Add a new **Yinxiang provider** (`src/providers/yinxiang/`) with full export/import support
- Implement OAuth-based authentication flow for Yinxiang API access
- Add notebook selection support so users can choose target notebooks when exporting
- Extend the provider registry and settings UI to support Yinxiang configuration
- Add i18n strings for Yinxiang-related UI labels and notices
- Add commands: "Export active note to Yinxiang" and context-menu submenu entries
- **BREAKING**: None — this is a pure addition with no changes to existing providers

## Capabilities

### New Capabilities
- `yinxiang-export`: Export Obsidian notes to Yinxiang via REST API (create notes, optionally specify target notebook)
- `yinxiang-import`: Import notes from Yinxiang back to Obsidian (list notebooks, list notes, fetch note content)
- `yinxiang-auth`: OAuth authentication flow to obtain and refresh access tokens

### Modified Capabilities
- None. Existing providers and core orchestrator remain unchanged.

## Impact

- **New files**: `src/providers/yinxiang/*`, `src/providers/yinxiang/types.ts`
- **Modified files**: `src/main.ts` (add commands/menu items), `src/providers/factories.ts` (register factory), `src/providers/registry.ts` (no structural change), `src/settings/settings-tab.ts` (add Yinxiang config UI), `src/i18n/locales/*.ts` (new strings)
- **Dependencies**: None — uses Obsidian's built-in `requestUrl` for HTTPS API calls
- **APIs used**: Yinxiang third-party REST API (`app.yinxiang.com/third/*`)
- **Platform support**: Desktop and mobile (OAuth via external browser + Obsidian protocol callback)
