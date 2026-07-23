# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1] - 2026-07-23

### Added

- IMA (Tencent) export provider via its official OpenAPI (`https://ima.qq.com`).
- Unified `FuzzySuggestModal` target picker across IMA, Yinxiang, WeKnora, and Youdao — replaces raw-ID text fields and bespoke dropdowns.
- Youdao folder picker (lists folders from the CLI).
- Header enabled toggle on each provider card — no need to expand the card to enable a provider.
- "Configuration incomplete" badge, plus auto-expand-with-notice when enabling an unconfigured provider.

### Changed

- Settings UI polish: overflow-safe target rows (truncation + tooltips), card-header hover, consistent Obsidian-native styling.

### Fixed

- IMA: surface server error reasons (the `msg` field), correct the folder-list response shape, and keep page size within the API's `(0, 20]` limit.
- Youdao: note listing works on CLI v1.1.5 (parses text output; `list`/`search` have no `--json` there).

## [0.2.0] - 2026-07-23

### Added

- WeKnora export provider (push-only REST, knowledge-base picker, test connection).

### Changed

- Card-based settings renamed to "Notes Bridge".

## [0.1.5] - 2026-06-08

### Added

- Yinxiang (印象笔记) provider support.
- Card-based settings panel with provider cards, hover effects, and brand-colored left borders.
- Notebook Navigator integration — registers export menus via NN's Menus API when NN is installed.
- `tryCreateSubmenu()` helper for robust submenu creation across Obsidian versions.

### Changed

- Context menu flattened to 2 levels max to avoid Obsidian's sub-sub-menu freeze bug
  ([forum.obsidian.md/t/74618](https://forum.obsidian.md/t/bug-sub-sub-menus-do-not-behave-correctly/74618)).
- Context menu items are now dynamic — only providers that are enabled, valid, and available appear.
- Built-in actions (Copy as Pure Markdown) separated from provider actions with visual sections.
- Each provider group separated by dividers in the context menu.
- Removed meaningless green "Enabled" badges from provider cards in settings.
- `isDesktopOnly` set to `true` in manifest (plugin uses CLI subprocesses).

### Fixed

- Replaced `innerHTML` usage with `DOMParser` + `appendChild` for SVG rendering (plugin guidelines compliance).
- Gated `console.warn` in main.ts behind `developerLog` setting.
- Removed stray `console.warn` in i18n module.
- Fixed LICENSE copyright from "Dynalist Inc." to "HUANG Cheng".

## [0.1.4] - 2025-05-20

### Added

- i18n support and unified provider card UI in settings.
- Removed trusted toggle from settings.

## [0.1.3] - 2025-05-16

### Added

- Flomo provider: settings card, commands, file-menu submenu, MCP `write_note` push.

## [0.1.2] - 2025-04-10

### Fixed

- ESLint warnings and unused imports.

## [0.1.1] - 2025-03-15

### Added

- WPS Cloud Note and Youdao Note providers.
- Export and import commands for Bear.

## [0.1.0] - 2025-02-01

- Initial release with Bear import/export and pure Markdown copy.
