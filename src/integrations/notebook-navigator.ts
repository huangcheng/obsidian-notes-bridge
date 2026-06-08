import type { Menu, MenuItem, TFile } from "obsidian";
import type AdvancedImportExportPlugin from "../main";
import type { NoteSelection } from "../selection/note-selection";

/**
 * Minimal interface for the Notebook Navigator API subset we use.
 * Avoids a hard dependency on NN's type definitions.
 */
interface NNMenuContext {
	addItem(cb: (item: MenuItem) => void): void;
	file: TFile;
	selection: { mode: "single" | "multiple"; files: TFile[] };
}

interface NNAPI {
	whenReady?(): Promise<void>;
	menus?: {
		registerFileMenu(cb: (ctx: NNMenuContext) => void): (() => void) | void;
	};
}

/**
 * Adapter that wraps NN's `addItem` callback into an object compatible
 * with Obsidian's `Menu` interface so we can reuse `addPluginSubmenu`
 * without refactoring it.
 */
class MenuAdapter {
	constructor(private readonly addItemFn: (cb: (item: MenuItem) => void) => void) {}

	addItem(cb: (item: MenuItem) => void): this {
		this.addItemFn(cb);
		return this;
	}
}

/**
 * Try to get the Notebook Navigator API if the plugin is installed and enabled.
 */
function getNotebookNavigatorAPI(app: import("obsidian").App): NNAPI | undefined {
	const plugins = (app as any).plugins?.plugins as Record<string, any> | undefined;
	return plugins?.["notebook-navigator"]?.api as NNAPI | undefined;
}

/**
 * Register our export submenu with Notebook Navigator's file context menu.
 * Returns a dispose function if registration succeeded, undefined otherwise.
 */
function registerNNFileMenu(
	plugin: AdvancedImportExportPlugin,
	nn: NNAPI,
): (() => void) | undefined {
	if (!nn.menus?.registerFileMenu) return undefined;

	const dispose = nn.menus.registerFileMenu(({ addItem, file, selection }) => {
		// Build a NoteSelection from NN's context
		const files = selection.files ?? [file];
		const notes = files.filter((f: TFile) => f.extension === "md");
		if (notes.length === 0) return;

		const sel: NoteSelection = {
			source: selection.mode === "multiple" ? "files-menu" : "file-menu",
			notes,
		};

		// Wrap NN's addItem into a Menu-like adapter
		const adapter = new MenuAdapter(addItem);
		plugin.addPluginSubmenu(adapter as unknown as Menu, sel);
	});

	return typeof dispose === "function" ? dispose : undefined;
}

/**
 * Detect Notebook Navigator and register our menus with it.
 * Call this in `onload()` — it handles the case where NN loads after us
 * by deferring registration to `onLayoutReady`.
 */
export function tryRegisterNotebookNavigatorMenus(plugin: AdvancedImportExportPlugin): void {
	let disposeFn: (() => void) | undefined;

	const attempt = () => {
		if (disposeFn) return; // already registered
		const nn = getNotebookNavigatorAPI(plugin.app);
		if (!nn) return;
		disposeFn = registerNNFileMenu(plugin, nn);
	};

	// Try immediately (works if NN loaded before us)
	attempt();

	// Also try after layout is ready (works if NN loads after us)
	plugin.app.workspace.onLayoutReady(() => {
		attempt();
	});

	// Clean up on unload
	plugin.register(() => {
		disposeFn?.();
		disposeFn = undefined;
	});
}
