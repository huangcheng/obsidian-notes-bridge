## 1. Provider Foundation

- [x] 1.1 Create `src/providers/yinxiang/types.ts` with `YinxiangProviderConfig` interface
- [x] 1.2 Create `src/providers/yinxiang/yinxiang-provider.ts` with `YinxiangProvider` class implementing `Provider`
- [x] 1.3 Implement `available()`, `testConnection()`, and token validation helpers
- [x] 1.4 Add `yinxiangFactory` to `src/providers/factories.ts` and register in `registerAllFactories()`

## 2. Authentication & Settings

- [x] 2.1 Add Yinxiang provider config type to `src/settings/index.ts` and `DEFAULT_SETTINGS`
- [x] 2.2 Add Yinxiang configuration UI to `src/settings/settings-tab.ts` (token input, test connection, default notebook picker)
- [x] 2.3 Add i18n strings for Yinxiang auth flows in `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts`

## 3. Export (Push) Implementation

- [x] 3.1 Implement `push()` method: convert Markdown to ENML-compatible HTML
- [x] 3.2 Implement `createNoteFromMCP` API call with `requestUrl`
- [x] 3.3 Support optional `notebookGuid` parameter (default notebook from config)
- [x] 3.4 Add title sanitization for invalid Yinxiang filename characters
- [x] 3.5 Handle API errors (invalid token, rate limit, malformed ENML) with user-friendly notices

## 4. Import (Fetch/List) Implementation

- [x] 4.1 Implement `listRemote()` using `searchNotesByFilter` API (recent notes, no keyword)
- [x] 4.2 Implement search variant of `listRemote()` with keyword filter
- [x] 4.3 Implement `fetch()` using `getNoteDetail` API to retrieve full note content
- [x] 4.4 Create ENML-to-Markdown converter for import (handle basic tags: div, p, br, b, i, u, a, ul, ol, li)
- [x] 4.5 Preserve tags as YAML frontmatter in imported notes

## 5. Notebook Integration

- [x] 5.1 Implement `listNoteBooks` API call and caching
- [x] 5.2 Add default notebook selector in settings UI
- [x] 5.3 Add runtime notebook picker for export (fallback if no default set)

## 6. Plugin Integration

- [x] 6.1 Add `YINXIANG_NAME` to `src/ui/brand-names.ts`
- [x] 6.2 Add "Export active note to Yinxiang" command in `src/main.ts`
- [x] 6.3 Add Yinxiang submenu to context menus (`addYinxiangSubmenus` in `src/main.ts`)
- [x] 6.4 Add `listYinxiangConfigs()` and `pickYinxiangAndExport()` helpers in `src/main.ts`
- [x] 6.5 Wire `exportToProvider()` to handle Yinxiang configs

## 7. Testing & Validation

- [x] 7.1 Verify provider registration and settings persistence
- [x] 7.2 Test export flow: single note, multiple notes, with/without default notebook
- [x] 7.3 Test import flow: list notes, search notes, fetch and convert
- [x] 7.4 Test error handling: invalid token, network failure, API errors
- [x] 7.5 Verify mobile compatibility (OAuth copy-paste flow)
- [x] 7.6 Run `npm run build` and fix any TypeScript errors
