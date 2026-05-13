import { App, Modal, Notice, Setting } from "obsidian";
import { ExportPlan } from "../orchestrator/file-writer";
import { summarize } from "../transforms/report";
import { t } from "../i18n";

export interface ConfirmResult {
	destinationDir: string;
	confirmed: boolean;
}

/**
 * Modal used before any destructive Markdown export. Lists each note
 * with a one-line `TransformReport` summary and asks for a destination
 * folder. Calls `onConfirm` when the user clicks "Export".
 */
export class ExportConfirmModal extends Modal {
	private destinationDir: string;
	private confirmed = false;

	constructor(
		app: App,
		private readonly plans: ExportPlan[],
		defaultDir: string,
		private readonly onConfirm: (result: ConfirmResult) => void,
	) {
		super(app);
		this.destinationDir = defaultDir;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: t("modals.exportConfirm.title") });
		contentEl.createEl("p", {
			text: `${this.plans.length} note(s) will be exported. Review the transforms below.`,
		});

		const list = contentEl.createEl("ul");
		for (const plan of this.plans) {
			const li = list.createEl("li");
			li.createEl("strong", { text: plan.file.basename });
			li.createSpan({ text: ` — ${summarize(plan.report)}` });
			if (plan.report.warnings.length) {
				const warn = li.createEl("ul");
				for (const w of plan.report.warnings) warn.createEl("li", { text: w });
			}
		}

		new Setting(contentEl)
			.setName("Destination folder")
			.setDesc("Vault-relative location; will be created if missing")
			.addText((text) =>
				text
					.setPlaceholder("Exports")
					.setValue(this.destinationDir)
					.onChange((v) => (this.destinationDir = v.trim())),
			);

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
		const exportBtn = buttons.createEl("button", { text: "Export", cls: "mod-cta" });
		exportBtn.addEventListener("click", () => {
			if (!this.destinationDir) {
				new Notice("Please choose a destination folder.");
				return;
			}
			this.confirmed = true;
			this.onConfirm({ destinationDir: this.destinationDir, confirmed: true });
			this.close();
		});
	}

	onClose(): void {
		if (!this.confirmed) {
			this.onConfirm({ destinationDir: this.destinationDir, confirmed: false });
		}
		this.contentEl.empty();
	}
}
