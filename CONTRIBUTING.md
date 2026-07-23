# Contributing to Notes Bridge

Thanks for your interest in contributing! Notes Bridge is an Obsidian plugin that exports notes as portable Markdown and bridges your vault with Bear, WPS Cloud Note, Youdao Note, Flomo, Yinxiang, WeKnora, and IMA. This guide covers getting set up and the patterns the project follows. By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Requirements:

- [Node.js](https://nodejs.org/) 18 or newer.
- A recent [Obsidian](https://obsidian.md) install for manual testing.

```bash
git clone https://github.com/huangcheng/obsidian-notes-bridge.git
cd obsidian-notes-bridge
npm install
npm run dev        # watch mode — rebuild on every change
```

Other scripts:

```bash
npm run build      # type-check (tsc) + production bundle via esbuild
npm run lint       # ESLint
npm run test       # Node test runner (tsx)
```

The build output is `main.js`, plus `manifest.json` and `styles.css`, all at the repo root. For manual testing, symlink or copy those three files into `<vault>/.obsidian/plugins/advanced-import-export/` and reload Obsidian.

## Project structure

```
src/
  main.ts                 # plugin lifecycle (onload/onunload) + command registration
  settings/
    index.ts              # PluginSettings, ProviderConfig union, default-provider migration
    settings-tab.ts       # settings UI: provider cards, shared rows (openCollapsibleCard,
                          #   renderRemoteTargetRow), header enabled toggle, incomplete badge
  providers/
    provider.ts           # Provider interface, NormalizedNote, capabilities
    registry.ts           # ProviderRegistry + ProviderKind union + ProviderFactory
    factories.ts          # registerAllFactories() — wires every built-in provider
    <kind>/
      types.ts            # config interface + DEFAULT_*_CONFIG + API constants
      <kind>-provider.ts  # the Provider class + its factory object
  orchestrator/           # export planning, file writing, concurrency
  transforms/             # Markdown transform pipeline + transform config
  selection/              # turning editor / file-menu events into NoteSelection
  ui/                     # brand names, modals, the shared RemoteTargetPickerModal
  i18n/
    index.ts              # type-safe t() helper (TranslationKey is derived from en)
    locales/en.ts         # English (source of truth for the key set)
    locales/zh.ts         # 简体中文 (must mirror en.ts structure exactly)
  util/                   # subprocess helpers, etc.
manifest.json             # plugin id/name/version/minAppVersion/isDesktopOnly
styles.css                # settings UI styles
```

## Adding a provider

The canonical pattern is to mirror an existing push-only provider — **WeKnora** or **IMA** are the cleanest templates. Concretely:

1. **Add the kind** to the `ProviderKind` union in `src/providers/registry.ts`.
2. **Create `src/providers/<kind>/types.ts`** with:
   - a config interface extending `ProviderConfigBase` (with `kind: "<kind>"`),
   - a `DEFAULT_<KIND>_CONFIG` using the `Omit<..., "id" | "displayName">` pattern,
   - the API base URL constant and any response types.
3. **Create `src/providers/<kind>/<kind>-provider.ts`** with a class implementing `Provider` (set capability flags, `available()`, `push()`, and a `testConnection()`), plus an exported `<kind>Factory: ProviderFactory<...>`. Use Obsidian's `requestUrl` for HTTP, with `throw: false` and manual status checks. Never log credentials.
4. **Register the factory** in `src/providers/factories.ts` (`registerAllFactories`).
5. **Add to settings** in `src/settings/index.ts`: import the config type, add it to the `ProviderConfig` union, and add an idempotent seed block in `applyDefaultProviderMigration()` (mirrors the others).
6. **Add a settings card** in `src/settings/settings-tab.ts`: a `case` in `renderProviderCard()` dispatching to `renderXProvider(...)`, which calls `openCollapsibleCard(...)` and reuses `renderRemoteTargetRow(...)` for any target selector. No need to render an "Enabled" row — that lives in the card header.
7. **Add the command + helpers** in `src/main.ts` (mirror `export-active-to-ima`): a `checkCallback` command, a `listXConfigs()` filter, and a `pickXAndExport()` helper; add the config type to the `exportToProvider()` union and the `providerIcon()` switch.
8. **Add i18n keys to BOTH** `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts` — identical structure. `TranslationKey` is derived from `en.ts`, so a key present in only one file fails the build.
9. **Document the outbound endpoint** in the Privacy / Outbound endpoints table of both `README.md` and `README.zh-CN.md`, and add a `## [Unreleased]` entry to `CHANGELOG.md`.

## Code style

- TypeScript strict mode; resolve every type error before submitting.
- Run `npm run lint` and fix reported issues.
- Prefer `async/await` over promise chains; handle errors gracefully.
- No `console.*` outside the `developerLog` gate (the plugin must stay quiet by default).
- Register all DOM, app-event, and interval cleanup via the `register*` helpers so reload/unload is leak-free.
- Keep credentials out of source and logs. Defaults for secret fields are empty/`undefined`.

## Submitting changes

1. Fork the repo and create a feature branch.
2. Make focused commits using [Conventional Commits](https://www.conventionalcommits.org/) prefixes — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` — matching the existing history.
3. Update `CHANGELOG.md` under `## [Unreleased]` (Added / Changed / Fixed).
4. Ensure `npm run build` and `npm run lint` pass.
5. Open a pull request describing the change, and call out any **privacy or network implications** (new endpoints, data sent, credentials) so they can be reviewed and documented.

## Releasing (maintainer notes)

1. Bump `version` in `manifest.json` (SemVer `x.y.z`).
2. Add the matching entry to `versions.json` mapping the new version → minimum app version.
3. Move `## [Unreleased]` content into a dated `## [x.y.z]` section in `CHANGELOG.md`.
4. Commit, then tag the release with the exact version string (no leading `v`).
5. Attach `main.js`, `manifest.json`, and `styles.css` to the GitHub release as individual assets.
