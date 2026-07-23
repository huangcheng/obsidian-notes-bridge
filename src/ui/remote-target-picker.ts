import { App, FuzzySuggestModal } from "obsidian";

/** A pickable remote target (notebook, knowledge base, folder, …). */
export interface RemoteTargetItem {
	id: string;
	name: string;
}

/**
 * Generic fuzzy-picker modal for choosing a remote target. Shared by the
 * IMA / Yinxiang / WeKnora settings cards' target-selector rows.
 * `onChoose` is invoked with the picked item; it is not called if the
 * modal is dismissed without a selection.
 */
export class RemoteTargetPickerModal extends FuzzySuggestModal<RemoteTargetItem> {
	constructor(
		app: App,
		private readonly items: RemoteTargetItem[],
		private readonly onChoose: (item: RemoteTargetItem) => void,
		placeholder?: string,
	) {
		super(app);
		if (placeholder) this.setPlaceholder(placeholder);
	}

	getItems(): RemoteTargetItem[] {
		return this.items;
	}

	getItemText(item: RemoteTargetItem): string {
		return item.name;
	}

	onChooseItem(item: RemoteTargetItem): void {
		this.onChoose(item);
	}
}
