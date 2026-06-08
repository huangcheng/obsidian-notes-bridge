import { Menu, MenuItem, moment, Notice, ObsidianProtocolData, Plugin, TAbstractFile, TFile } from "obsidian";
import { initializeI18n, t } from "./i18n";
import { Orchestrator } from "./orchestrator/orchestrator";
import { planExport, writeExports } from "./orchestrator/file-writer";
import { BearProvider } from "./providers/bear/bear-provider";
import { tagsFromFrontmatter } from "./providers/bear/export";
import { writeImportedNote } from "./providers/bear/import";
import { parseBearInput } from "./providers/bear/url-scheme";
import { FlomoProviderConfig } from "./providers/flomo/types";
import { registerAllFactories } from "./providers/factories";
import { Provider } from "./providers/provider";
import { ProviderConfigBase, ProviderRegistry } from "./providers/registry";
import { WpsProviderConfig } from "./providers/wps/types";
import { YoudaoProviderConfig } from "./providers/youdao/types";
import { YinxiangProviderConfig } from "./providers/yinxiang/types";
import { selectionFromActiveEditor, selectionFromFileMenu, selectionFromFiles } from "./selection/builders";
import { NoteSelection } from "./selection/note-selection";
import { applyDefaultProviderMigration, DEFAULT_SETTINGS, PluginSettings } from "./settings";
import { AdvancedImportExportSettingTab } from "./settings/settings-tab";
import { MarkdownTransformer } from "./transforms/transformer";
import { FLOMO_NAME, WPS_NAME, YOUDAO_NAME, YINXIANG_NAME } from "./ui/brand-names";
import { ExportConfirmModal } from "./ui/export-confirm-modal";
import { BearImportModal } from "./ui/bear-import-modal";
import { tryRegisterNotebookNavigatorMenus } from "./integrations/notebook-navigator";

/**
 * Robust submenu creation that works across Obsidian versions.
 * Based on Notebook Navigator's tryCreateSubmenu pattern.
 * Obsidian's MenuItem.setSubmenu has two different API signatures:
 * - Setter style: item.setSubmenu(menu) — takes a Menu as argument
 * - Getter style: item.setSubmenu() — creates and returns a Menu
 */
function tryCreateSubmenu(item: MenuItem): Menu | null {
	const maybeItem = item as MenuItem & { setSubmenu?: (...args: unknown[]) => unknown };
	if (typeof maybeItem.setSubmenu !== "function") {
		return null;
	}

	// Try setter style first (newer Obsidian)
	if (maybeItem.setSubmenu.length > 0) {
		const submenu = new Menu();
		try {
			maybeItem.setSubmenu(submenu);
			return submenu;
		} catch {
			// fall through to getter style
		}
	}

	// Try getter style (older Obsidian)
	try {
		const maybeMenu = maybeItem.setSubmenu() as Menu | undefined;
		if (maybeMenu && typeof maybeMenu.addItem === "function") {
			return maybeMenu;
		}
	} catch {
		// ignore
	}

	return null;
}

export default class AdvancedImportExportPlugin extends Plugin {
	settings!: PluginSettings;
	registry!: ProviderRegistry;
	orchestrator!: Orchestrator;
	private bearImportModal: BearImportModal | null = null;

	async onload(): Promise<void> {
		initializeI18n(moment.locale());
		this.registry = new ProviderRegistry();
		registerAllFactories(this.registry);
		await this.loadSettings();
		this.registry.loadConfigs(this.settings.providers);
		this.orchestrator = new Orchestrator({
			app: this.app,
			concurrency: this.settings.concurrency,
		});

		this.addCommand({
			id: "copy-as-pure-markdown",
			name: t("commands.copyAsMarkdown"),
			checkCallback: (checking) => {
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.copyAsPureMarkdown(sel);
				return true;
			},
		});

		this.addCommand({
			id: "export-as-pure-markdown-active",
			name: t("commands.exportCurrentNote"),
			checkCallback: (checking) => {
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.exportSelection(sel);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				const sel = selectionFromFileMenu(file);
				if (sel.notes.length === 0) return;
				this.addPluginSubmenu(menu, sel);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("files-menu", (menu: Menu, files: TAbstractFile[]) => {
				const tFiles = files.filter((f): f is TFile => f instanceof TFile);
				const sel = selectionFromFiles(tFiles);
				if (sel.notes.length === 0) return;
				this.addPluginSubmenu(menu, sel);
			}),
		);

		// Register with Notebook Navigator's context menus if installed
		tryRegisterNotebookNavigatorMenus(this);

		this.addSettingTab(new AdvancedImportExportSettingTab(this.app, this));

		this.addCommand({
			id: "export-active-to-bear",
			name: t("commands.sendToBear"),
			checkCallback: (checking) => {
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.exportToBear(sel.notes);
				return true;
			},
		});

		this.addCommand({
			id: "import-from-bear",
			name: t("commands.importFromBear"),
			callback: () => this.importFromBear(),
		});

		this.addCommand({
			id: "export-active-to-wps",
			name: t("commands.sendToWps"),
			checkCallback: (checking) => {
				if (this.listWpsConfigs().length === 0) return false;
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.pickWpsAndExport(sel.notes);
				return true;
			},
		});

		this.addCommand({
			id: "export-active-to-youdao",
			name: t("commands.sendToYoudao"),
			checkCallback: (checking) => {
				if (this.listYoudaoConfigs().length === 0) return false;
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.pickYoudaoAndExport(sel.notes);
				return true;
			},
		});

		this.addCommand({
			id: "export-active-to-flomo",
			name: t("commands.sendToFlomo"),
			checkCallback: (checking) => {
				if (this.listFlomoConfigs().length === 0) return false;
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.pickFlomoAndExport(sel.notes);
				return true;
			},
		});

		this.addCommand({
			id: "export-active-to-yinxiang",
			name: t("commands.sendToYinxiang"),
			checkCallback: (checking) => {
				if (this.listYinxiangConfigs().length === 0) return false;
				const sel = selectionFromActiveEditor(this.app);
				if (!sel || sel.notes.length === 0) return false;
				if (!checking) void this.pickYinxiangAndExport(sel.notes);
				return true;
			},
		});

		this.registerObsidianProtocolHandler("bear-callback", (data) => this.handleBearUri(data));
	}

	onunload(): void {
		this.registry.disposeAll();
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as Partial<PluginSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(raw ?? {}),
			transform: { ...DEFAULT_SETTINGS.transform, ...(raw?.transform ?? {}) },
			providers: raw?.providers ?? [],
		};
		applyDefaultProviderMigration(this.settings);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Some settings affect long-lived components.
		this.orchestrator = new Orchestrator({
			app: this.app,
			concurrency: this.settings.concurrency,
		});
		this.registry.loadConfigs(this.settings.providers);
	}

	private buildTransformer(): MarkdownTransformer {
		return new MarkdownTransformer(this.app, this.settings.transform);
	}

	private async copyAsPureMarkdown(selection: NoteSelection): Promise<void> {
		const file = selection.notes[0];
		if (!file) {
			new Notice(t("notices.noActiveNote"));
			return;
		}
		const transformer = this.buildTransformer();
		const source = await this.app.vault.cachedRead(file);
		const { output } = transformer.run({ source, file });
		try {
			await navigator.clipboard.writeText(output);
			new Notice(t("notices.copied"));
		} catch (err) {
			new Notice(t("notices.clipboardFailed", { error: errorMessage(err) }));
		}
	}

	private async exportSelection(selection: NoteSelection): Promise<void> {
		if (selection.notes.length === 0) {
			new Notice(t("notices.noNotesSelected"));
			return;
		}
		const transformer = this.buildTransformer();
		const plans = await planExport(this.app, transformer, selection.notes);
		new ExportConfirmModal(this.app, plans, this.settings.defaultExportDir, (result) => {
			void (async () => {
				if (!result.confirmed) return;
				const summary = await writeExports(this.app, plans, {
					files: selection.notes,
					destinationDir: result.destinationDir,
					copyAttachments: false,
					collisionPolicy: "rename",
				});
				new Notice(
					t("notices.exportComplete", { written: summary.written.length, skipped: summary.skipped.length, failed: summary.failed.length }),
				);
			})();
		}).open();
	}

	private getBearProvider(): BearProvider | null {
		const provider = this.registry.get("bear");
		if (!provider) return null;
		return provider as BearProvider;
	}

	private async exportToBear(files: TFile[]): Promise<void> {
		if (files.length === 0) {
			new Notice(t("notices.noNotesToExport"));
			return;
		}
		const provider = this.getBearProvider();
		if (!provider) {
 new Notice(t("notices.bearNotConfigured"));
			return;
		}
		const avail = provider.available?.() ?? { ok: true };
		if (!avail.ok) {
			new Notice(avail.reason ?? t("notices.bearUnavailable"));
			return;
		}
		const transformer = this.buildTransformer();
		let dispatched = 0;
		let failed = 0;
		for (const file of files) {
			try {
				const source = await this.app.vault.cachedRead(file);
				const { output } = transformer.run({ source, file });
				const tags = tagsFromFrontmatter(this.app, file);
				await provider.push({
					remoteId: "",
					title: file.basename,
					body: output,
					tags,
					attachments: [],
					sourceMeta: {},
				});
				dispatched++;
			} catch {
				failed++;
			}
		}
		if (failed === 0) {
			new Notice(t("notices.bearDispatched", { count: dispatched, s: dispatched !== 1 ? "s" : "" }));
		} else {
			new Notice(t("notices.bearPartialFail", { dispatched, failed }));
		}
	}

	private importFromBear(): void {
		const provider = this.getBearProvider();
		if (!provider) {
			new Notice(t("notices.bearNotConfigured"));
			return;
		}
		const avail = provider.available?.() ?? { ok: true };
		if (!avail.ok) {
			new Notice(avail.reason ?? t("notices.bearUnavailable"));
			return;
		}
		this.bearImportModal = new BearImportModal(this.app, (request) => {
			void (async () => {
				const noteId = parseBearInput(request.noteId);
				if (!noteId) {
					new Notice(t("notices.invalidBearId"));
					return;
				}
				this.bearImportModal?.setWaiting();
				try {
					const note = await provider.fetch(noteId);
					const path = await writeImportedNote(this.app, note, this.settings.defaultImportDir);
					this.bearImportModal?.setDone(true, `Note imported to ${path}`);
					new Notice(t("notices.bearImported", { title: note.title, path }));
				} catch (err) {
					const msg = errorMessage(err);
					this.bearImportModal?.setDone(false, msg);
					new Notice(t("notices.bearImportFailed", { error: msg }));
				}
			})();
		});
		this.bearImportModal.open();
	}

	private handleBearUri(data: ObsidianProtocolData): void {
		const search = Object.entries(data)
			.filter(([key]) => key !== "action")
			.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
			.join("&");
		const provider = this.getBearProvider();
		if (!provider) return;
		provider.handleCallback(search);
	}


	/**
	 * Add the plugin submenu to a context menu.
	 * Uses only 2 levels of nesting to avoid Obsidian's sub-sub-menu bug
	 * (https://forum.obsidian.md/t/bug-sub-sub-menus-do-not-behave-correctly/74618).
	 *
	 * Items are added dynamically based on:
	 * 1. The provider is valid (registered factory, provider can be created)
	 * 2. The provider is enabled in settings
	 */
	addPluginSubmenu(menu: Menu, selection: NoteSelection): void {
		const { notes } = selection;
		if (notes.length === 0) return;

		// Collect all valid+enabled providers upfront
		const entries = this.buildMenuEntries();
		if (entries.length === 0 && notes.length > 1) return;

		menu.addItem((item) => {
			item.setTitle(t("brands.plugin")).setIcon("lucide-arrow-left-right");
			const sub = tryCreateSubmenu(item);

			if (!sub) return;

			if (notes.length === 1) {
				sub.addItem((s) =>
					s
						.setTitle(t("commands.copyAsMarkdown"))
						.setIcon("clipboard-copy")
						.setSection("built-in")
						.onClick(() => void this.copyAsPureMarkdown(selection)),
				);
			}

			if (entries.length > 0) {
				this.populateSubmenu(sub, entries, notes);
			}
		});
	}

	/**
	 * Build the list of menu entries from enabled, valid providers.
	 */
	private buildMenuEntries(): MenuEntry[] {
		const entries: MenuEntry[] = [];

		for (const config of this.settings.providers) {
			if (config.enabled === false) continue;

			const provider = this.registry.get(config.id);
			// registry.get() returns null if no factory, not enabled, or creation fails
			if (!provider) continue;

			const avail = provider.available?.() ?? { ok: true };
			// Skip providers that aren't available in the current environment
			if (!avail.ok) continue;

			const icon = provider.icon ?? providerIcon(config.kind);

			entries.push({
				config,
				provider,
				avail,
				icon,
			});
		}

		return entries;
	}

	/**
	 * Populate the plugin submenu with flat items for each provider entry.
	 * Uses setSection() per provider for visual grouping and separators between providers.
	 */
	private populateSubmenu(menu: Menu, entries: MenuEntry[], files: TFile[]): void {
		let first = true;
		for (const entry of entries) {
			const { config, icon } = entry;

			if (!first) menu.addSeparator();
			first = false;

			if (config.kind === "bear") {
				this.addBearFlatItems(menu, files);
			} else {
				menu.addItem((item) =>
					item
						.setTitle(
							files.length === 1
								? `Export note to ${config.displayName}`
								: `Export ${files.length} notes to ${config.displayName}`,
						)
						.setIcon(icon)
						.setSection(config.id)
						.onClick(async () => {
							try {
								await this.exportToProvider(config as WpsProviderConfig | YoudaoProviderConfig | FlomoProviderConfig | YinxiangProviderConfig, files);
							} catch (err) {
								new Notice(t("notices.exportFailed", { error: errorMessage(err) }));
							}
						}),
				);
			}
		}
	}

	/**
	 * Add flat Bear items (export + import) to the submenu.
	 */
	private addBearFlatItems(menu: Menu, files: TFile[]): void {
		menu.addItem((item) =>
			item
				.setTitle(
					files.length === 1
						? t("commands.sendToBear")
						: `Send ${files.length} notes to ${t("brands.bear")}`,
				)
				.setIcon("upload")
				.setSection("bear")
				.onClick(() => void this.exportToBear(files)),
		);

		menu.addItem((item) =>
			item
				.setTitle(`${t("commands.importFromBear")}…`)
				.setIcon("download")
				.setSection("bear")
				.onClick(() => this.importFromBear()),
		);
	}

	private listWpsConfigs(): WpsProviderConfig[] {
		return this.settings.providers.filter(
			(p): p is WpsProviderConfig => p.kind === "wps" && p.enabled !== false,
		);
	}

	private listYoudaoConfigs(): YoudaoProviderConfig[] {
		return this.settings.providers.filter(
			(p): p is YoudaoProviderConfig => p.kind === "youdao" && p.enabled !== false,
		);
	}

	private async pickYoudaoAndExport(files: TFile[]): Promise<void> {
		const configs = this.listYoudaoConfigs();
		if (configs.length === 0) {
			new Notice(t("notices.noProviderConfigured", { provider: YOUDAO_NAME }));
			return;
		}
		const target = configs.length === 1 ? configs[0]! : await this.pickProviderConfig(configs, t("notices.selectProvider", { provider: YOUDAO_NAME }));
		if (!target) return;
		await this.exportToProvider(target, files);
	}

	private listFlomoConfigs(): FlomoProviderConfig[] {
		return this.settings.providers.filter(
			(p): p is FlomoProviderConfig => p.kind === "flomo" && p.enabled !== false,
		);
	}

	private async pickFlomoAndExport(files: TFile[]): Promise<void> {
		const configs = this.listFlomoConfigs();
		if (configs.length === 0) {
			new Notice(t("notices.noProviderConfigured", { provider: FLOMO_NAME }));
			return;
		}
		const target = configs.length === 1 ? configs[0]! : await this.pickProviderConfig(configs, t("notices.selectProvider", { provider: FLOMO_NAME }));
		if (!target) return;
		await this.exportToProvider(target, files);
	}

	private listYinxiangConfigs(): YinxiangProviderConfig[] {
		return this.settings.providers.filter(
			(p): p is YinxiangProviderConfig => p.kind === "yinxiang" && p.enabled !== false,
		);
	}

	private async pickYinxiangAndExport(files: TFile[]): Promise<void> {
		const configs = this.listYinxiangConfigs();
		if (configs.length === 0) {
			new Notice(t("notices.noProviderConfigured", { provider: YINXIANG_NAME }));
			return;
		}
		const target = configs.length === 1 ? configs[0]! : await this.pickProviderConfig(configs, t("notices.selectProvider", { provider: YINXIANG_NAME }));
		if (!target) return;
		await this.exportToProvider(target, files);
	}

	private async exportToProvider(
		config: WpsProviderConfig | YoudaoProviderConfig | FlomoProviderConfig | YinxiangProviderConfig,
		files: TFile[],
	): Promise<void> {
		const provider = this.registry.get(config.id);
		if (!provider) {
			new Notice(t("notices.providerNotEnabled", { provider: config.displayName }));
			return;
		}
		const avail = provider.available?.() ?? { ok: true };
		if (!avail.ok) {
			new Notice(avail.reason ?? t("notices.providerUnavailable", { provider: config.displayName }));
			return;
		}
		const transformer = this.buildTransformer();
		let succeeded = 0;
		const failures: { file: TFile; error: string }[] = [];
		for (const file of files) {
			try {
				const source = await this.app.vault.cachedRead(file);
				const { output } = transformer.run({ source, file });
				await provider.push({
					remoteId: "",
					title: file.basename,
					body: output,
					tags: tagsFromFrontmatter(this.app, file),
					attachments: [],
					sourceMeta: { source: "vault", path: file.path },
				});
				succeeded++;
			} catch (err) {
				const msg = errorMessage(err);
				failures.push({ file, error: msg });
				if (this.settings.developerLog) {
					console.warn(`[${config.kind}] export failed for ${file.path}:`, err);
				}
			}
		}
		if (failures.length === 0) {
			new Notice(
				t("notices.exportedTo", { count: succeeded, s: succeeded === 1 ? "" : "s", provider: config.displayName }),
			);
		} else {
			const firstReason = failures[0]?.error ?? "unknown";
			new Notice(
				t("notices.exportPartialFail", { provider: config.displayName, succeeded, failed: failures.length, reason: firstReason }),
				12000,
			);
		}
	}

	private async pickWpsAndExport(files: TFile[]): Promise<void> {
		const configs = this.listWpsConfigs();
		if (configs.length === 0) {
			new Notice(t("notices.noProviderConfigured", { provider: WPS_NAME }));
			return;
		}
		const target = configs.length === 1 ? configs[0]! : await this.pickProviderConfig(configs, t("notices.selectProvider", { provider: WPS_NAME }));
		if (!target) return;
		await this.exportToProvider(target, files);
	}

	private async pickProviderConfig<C extends { id: string; displayName: string }>(
		items: C[],
		placeholder: string,
	): Promise<C | null> {
		const { FuzzySuggestModal } = await import("obsidian");
		return new Promise((resolve) => {
			class Picker extends FuzzySuggestModal<C> {
				private chose = false;
				constructor(
					app: import("obsidian").App,
					private readonly entries: C[],
				) {
					super(app);
				}
				getItems(): C[] { return this.entries; }
				getItemText(item: C): string { return item.displayName; }
				onChooseItem(item: C): void {
					this.chose = true;
					resolve(item);
				}
				onClose(): void {
					if (!this.chose) resolve(null);
					super.onClose();
				}
			}
			const picker = new Picker(this.app, items);
			picker.setPlaceholder(placeholder);
			picker.open();
		});
	}
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function providerIcon(kind: string): string {
	switch (kind) {
		case "wps": return "file-text";
		case "youdao": return "edit";
		case "flomo": return "notebook-pen";
		case "yinxiang": return "book-marked";
		default: return "export";
	}
}

interface MenuEntry {
	config: ProviderConfigBase;
	provider: Provider;
	avail: { ok: boolean; reason?: string };
	icon: string;
}
