import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AdvancedImportExportPlugin from "../main";
import { t } from "../i18n";
import { BearProvider, BearProviderConfig } from "../providers/bear/bear-provider";
import { DEFAULT_BEARCLI_PATH } from "../providers/bear/cli";
import { FlomoProvider } from "../providers/flomo/flomo-provider";
import { FlomoProviderConfig, FLOMO_TOKEN_HELP_URL } from "../providers/flomo/types";
import { ProviderConfigBase } from "../providers/registry";
import { WpsProvider } from "../providers/wps/wps-provider";
import { WpsProviderConfig } from "../providers/wps/types";
import { YoudaoProvider } from "../providers/youdao/youdao-provider";
import { YinxiangProvider } from "../providers/yinxiang/yinxiang-provider";
import { YinxiangProviderConfig, YINXIANG_OAUTH_URL } from "../providers/yinxiang/types";
import { BEAR_NAME, FLOMO_NAME, WPS_NAME, YOUDAO_NAME, YINXIANG_NAME } from "../ui/brand-names";
import {
	YOUDAO_API_KEY_URL,
	YOUDAO_INSTALL_CMD,
	YOUDAO_INSTALL_GUIDE,
	YoudaoProviderConfig,
} from "../providers/youdao/types";

/**
 * Lucide icon SVGs for provider cards.
 */
const PROVIDER_ICONS: Record<string, string> = {
	bear: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
	wps: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
	youdao: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
	flomo: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>`,
	yinxiang: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v8l3-3 3 3V2"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>`,
};

/**
 * Settings tab. Sections grow as adapters land — for the foundation we
 * expose the transform toggles, default export destination, concurrency,
 * developer log, and a placeholder for providers (UI lives in
 * `providers/registry-ui.ts` once adapters are implemented).
 */
export class AdvancedImportExportSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: AdvancedImportExportPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ---------- Transforms Section ----------
		const transformsSection = containerEl.createDiv({ cls: "aie-settings-section" });
		new Setting(transformsSection).setHeading().setName(t("settings.heading.transforms"));
		const xf = this.plugin.settings.transform;

		const transformsCard = transformsSection.createDiv({ cls: "aie-section-card" });

		new Setting(transformsCard)
			.setName(t("settings.labels.resolveWikilinks"))
			.setDesc(t("settings.descriptions.resolveWikilinks"))
			.addToggle((tog) =>
				tog.setValue(xf.resolveWikilinks).onChange(async (v) => {
					xf.resolveWikilinks = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(transformsCard)
			.setName(t("settings.labels.embedHandling"))
			.setDesc(t("settings.descriptions.embedHandling"))
			.addDropdown((dd) =>
				dd
					.addOptions({
						drop: t("settings.options.drop"),
						"replace-with-link": t("settings.options.replaceWithLink"),
						"inline-image-link": t("settings.options.inlineImageLink"),
					})
					.setValue(xf.embedHandling)
					.onChange(async (v) => {
						xf.embedHandling = v as typeof xf.embedHandling;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(transformsCard)
			.setName(t("settings.labels.flattenCallouts"))
			.setDesc(t("settings.descriptions.flattenCallouts"))
			.addToggle((tog) =>
				tog.setValue(xf.flattenCallouts).onChange(async (v) => {
					xf.flattenCallouts = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(transformsCard)
			.setName(t("settings.labels.dropFrontmatter"))
			.setDesc(t("settings.descriptions.dropFrontmatter"))
			.addToggle((tog) =>
				tog.setValue(xf.dropFrontmatter).onChange(async (v) => {
					xf.dropFrontmatter = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(transformsCard)
			.setName(t("settings.labels.attachmentLinks"))
			.setDesc(t("settings.descriptions.attachmentLinks"))
			.addDropdown((dd) =>
				dd
					.addOptions({
						"vault-relative": t("settings.options.vaultRelative"),
						absolute: t("settings.options.absolute"),
						"upload-placeholder": t("settings.options.uploadPlaceholder"),
					})
					.setValue(xf.rewriteAttachments)
					.onChange(async (v) => {
						xf.rewriteAttachments = v as typeof xf.rewriteAttachments;
						await this.plugin.saveSettings();
					}),
			);

		// ---------- File Locations Section ----------
		const fileSection = containerEl.createDiv({ cls: "aie-settings-section" });
		new Setting(fileSection).setHeading().setName(t("settings.heading.fileLocations"));

		const fileCard = fileSection.createDiv({ cls: "aie-section-card" });

		new Setting(fileCard)
			.setName(t("settings.labels.defaultExportFolder"))
			.setDesc(t("settings.descriptions.defaultExportFolder"))
			.addText((text) =>
				text
					.setPlaceholder("Exports")
					.setValue(this.plugin.settings.defaultExportDir)
					.onChange(async (v) => {
						this.plugin.settings.defaultExportDir = v.trim() || "Exports";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(fileCard)
			.setName(t("settings.labels.defaultImportFolder"))
			.setDesc(t("settings.descriptions.defaultImportFolder"))
			.addText((text) =>
				text
					.setPlaceholder("Imports")
					.setValue(this.plugin.settings.defaultImportDir)
					.onChange(async (v) => {
						this.plugin.settings.defaultImportDir = v.trim() || "Imports";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(fileCard)
			.setName(t("settings.labels.concurrency"))
			.setDesc(t("settings.descriptions.concurrency"))
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.concurrency))
					.onChange(async (v) => {
						const n = Number.parseInt(v, 10);
						if (Number.isFinite(n) && n >= 1 && n <= 16) {
							this.plugin.settings.concurrency = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(fileCard)
			.setName(t("settings.labels.developerLog"))
			.setDesc(t("settings.descriptions.developerLog"))
			.addToggle((tog) =>
				tog.setValue(this.plugin.settings.developerLog).onChange(async (v) => {
					this.plugin.settings.developerLog = v;
					await this.plugin.saveSettings();
				}),
			);

		// ---------- Providers Section ----------
		const providersSection = containerEl.createDiv({ cls: "aie-settings-section aie-providers-section" });
		new Setting(providersSection).setHeading().setName(t("settings.heading.providers"));
		providersSection.createEl("p", {
			cls: "aie-providers-intro",
			text: t("settings.providerIntro", {
				bear: t("brands.bear"),
				wps: t("brands.wps"),
				youdao: t("brands.youdao"),
				flomo: t("brands.flomo"),
				yinxiang: t("brands.yinxiang"),
			}),
		});

		const providersList = providersSection.createDiv({ cls: "aie-providers-list" });
		for (const cfg of this.plugin.settings.providers) {
			this.renderProviderCard(providersList, cfg);
		}
	}

	private renderProviderCard(containerEl: HTMLElement, config: ProviderConfigBase): void {
		switch (config.kind) {
			case "bear":
				this.renderBearProvider(containerEl, config as BearProviderConfig);
				return;
			case "wps":
				this.renderWpsProvider(containerEl, config as WpsProviderConfig);
				return;
			case "youdao":
				this.renderYoudaoProvider(containerEl, config as YoudaoProviderConfig);
				return;
			case "flomo":
				this.renderFlomoProvider(containerEl, config as FlomoProviderConfig);
				return;
			case "yinxiang":
				this.renderYinxiangProvider(containerEl, config as YinxiangProviderConfig);
				return;
			default:
				containerEl.createEl("p", {
					text: `Unknown provider kind: ${config.kind} (${config.displayName})`,
				});
		}
	}

	private openCollapsibleCard(
		parentEl: HTMLElement,
		title: string,
		config: ProviderConfigBase,
	): HTMLElement {
		const details = parentEl.createEl("details", {
			cls: "aie-provider-card",
			attr: { "data-kind": config.kind, "data-enabled": String(config.enabled) },
		});
		details.open = false;

		const summary = details.createEl("summary");

		// Left side: icon + title
		const summaryContent = summary.createDiv({ cls: "aie-provider-summary-content" });

		// Brand icon
		const iconWrapper = summaryContent.createDiv({ cls: "aie-provider-icon" });
		iconWrapper.innerHTML = (PROVIDER_ICONS[config.kind] ?? PROVIDER_ICONS.bear) as string;

		// Title
		const info = summaryContent.createDiv({ cls: "aie-provider-info" });
		info.createDiv({ cls: "aie-provider-title", text: title });

		// Expand chevron
		const expandIcon = summary.createSpan({ cls: "aie-provider-expand-icon" });
		expandIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

		return details.createDiv({ cls: "aie-provider-body" });
	}

	private renderWpsProvider(parentEl: HTMLElement, config: WpsProviderConfig): void {
		const containerEl = this.openCollapsibleCard(
			parentEl,
			config.displayName || t("brands.wps"),
			config,
		);
		const desc = containerEl.createEl("p");
		desc.setText(
			t("providers.wpsDescription", { provider: WPS_NAME }),
		);

		new Setting(containerEl).setName(t("settings.labels.displayName")).addText((text) =>
			text.setValue(config.displayName).onChange(async (v) => {
				config.displayName = v.trim() || t("brands.wps");
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.transport"))
			.setDesc(t("settings.descriptions.transport", { provider: WPS_NAME }))
			.addDropdown((dd) =>
				dd
					.addOptions({ mcp: t("settings.options.mcpServer"), cli: t("settings.options.cli", { provider: "wpsnote-cli" }) })
					.setValue(config.transport)
					.onChange(async (v) => {
						config.transport = v as WpsProviderConfig["transport"];
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (config.transport === "mcp") {
			if (!config.mcp) config.mcp = { transportType: "http", url: "", headers: {} };
			const mcp = config.mcp;

			new Setting(containerEl)
				.setName(t("settings.labels.serverTransport"))
				.addDropdown((dd) =>
					dd
						.addOptions({ http: t("settings.options.http"), stdio: t("settings.options.stdio") })
						.setValue(mcp.transportType ?? "http")
						.onChange(async (v) => {
							mcp.transportType = v as "http" | "stdio";
							await this.plugin.saveSettings();
							this.display();
						}),
				);

			if ((mcp.transportType ?? "http") === "http") {
				new Setting(containerEl)
					.setName(t("settings.labels.url"))
					.addText((text) =>
						text
							.setValue(mcp.url ?? "")
							.onChange(async (v) => {
								mcp.url = v.trim();
								await this.plugin.saveSettings();
							}),
					);
				new Setting(containerEl)
					.setName(t("settings.labels.headers"))
					.setDesc(t("settings.descriptions.headers"))
					.addTextArea((ta) =>
						ta
							.setValue(JSON.stringify(mcp.headers ?? {}, null, 2))
							.onChange(async (v) => {
								try {
									mcp.headers = JSON.parse(v || "{}") as Record<string, string>;
									await this.plugin.saveSettings();
								} catch {
									void 0;
								}
							}),
					);
			} else {
				new Setting(containerEl).setName(t("settings.labels.command")).addText((text) =>
					text
						.setValue(mcp.command ?? "")
						.onChange(async (v) => {
							mcp.command = v.trim();
							await this.plugin.saveSettings();
						}),
				);
				new Setting(containerEl)
					.setName(t("settings.labels.args"))
					.setDesc(t("settings.descriptions.args"))
					.addText((text) =>
						text
							.setValue((mcp.args ?? []).join(" "))
							.onChange(async (v) => {
								mcp.args = v.trim() ? v.trim().split(/\s+/) : [];
								await this.plugin.saveSettings();
							}),
					);
			}
		} else {
			if (!config.cli) config.cli = { binPath: "wpsnote-cli" };
			const cli = config.cli;
			new Setting(containerEl)
				.setName(t("settings.labels.cliBinary"))
				.setDesc(t("settings.descriptions.cliBinary", { provider: WPS_NAME }))
				.addText((text) =>
					text
						.setValue(cli.binPath ?? "")
						.onChange(async (v) => {
							cli.binPath = v.trim();
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl).setName(t("settings.labels.enabled")).addToggle((tog) =>
			tog.setValue(config.enabled).onChange(async (v) => {
				config.enabled = v;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.testConnection"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.test")).onClick(async () => {
					const provider = this.plugin.registry.get(config.id) as WpsProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const notice = new Notice(t("notices.connectionTesting"), 0);
					const result = await provider.testConnection?.();
					notice.hide();
					new Notice(result?.message ?? (result?.ok ? t("notices.connectionSuccess") : t("notices.connectionFailed")));
				}),
			);
	}

	private renderYoudaoProvider(parentEl: HTMLElement, config: YoudaoProviderConfig): void {
		const containerEl = this.openCollapsibleCard(
			parentEl,
			config.displayName || t("brands.youdao"),
			config,
		);
		const intro = containerEl.createEl("p");
		intro.appendText(t("providers.youdaoIntro") + " ");
		intro.createEl("a", {
			text: t("providers.getApiKey"),
			href: YOUDAO_API_KEY_URL,
		}).setAttr("target", "_blank");

		new Setting(containerEl).setName(t("settings.labels.displayName")).addText((text) =>
			text.setValue(config.displayName).onChange(async (v) => {
				config.displayName = v.trim() || t("brands.youdao");
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.cliBinary"))
			.setDesc(t("settings.descriptions.cliBinary", { provider: YOUDAO_NAME }))
			.addText((text) =>
				text
					.setValue(config.cliPath ?? "")
					.onChange(async (v) => {
						config.cliPath = v.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.labels.apiKey"))
			.setDesc(t("settings.descriptions.apiKey"))
			.addText((text) => {
				text.inputEl.type = "password";
				text.setValue(config.apiKey ?? "").onChange(async (v) => {
					config.apiKey = v;
					await this.plugin.saveSettings();
				});
			})
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.saveToCli")).onClick(async () => {
					if (!config.apiKey) {
						new Notice(t("notices.apiKeyRequired"));
						return;
					}
					const provider = this.plugin.registry.get(config.id) as YoudaoProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const result = await provider.setApiKey(config.apiKey);
					new Notice(result.message ?? (result.ok ? t("notices.apiKeySaved") : t("notices.apiKeySaveFailed")));
				}),
			);

		new Setting(containerEl)
			.setName(t("settings.labels.defaultFolderId"))
			.setDesc(t("settings.descriptions.defaultFolderId"))
			.addText((text) =>
				text
					.setValue(config.defaultFolderId ?? "")
					.onChange(async (v) => {
						config.defaultFolderId = v.trim() || undefined;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("settings.labels.enabled")).addToggle((tog) =>
			tog.setValue(config.enabled).onChange(async (v) => {
				config.enabled = v;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.detectCli"))
			.setDesc(t("settings.descriptions.detectCli"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.detect")).onClick(async () => {
					const provider = this.plugin.registry.get(config.id) as YoudaoProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const result = await provider.detectCli();
					if (result.installed) {
						new Notice(
							t("notices.cliDetected", {
								version: result.version ?? "youdaonote",
								path: result.resolvedPath ? ` at ${result.resolvedPath}` : "",
							}),
							8000,
						);
					} else {
						this.showYoudaoInstallNotice(result.message ?? "youdaonote not found");
					}
				}),
			);

		new Setting(containerEl)
			.setName(t("settings.labels.testConnection"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.test")).onClick(async () => {
					const provider = this.plugin.registry.get(config.id) as YoudaoProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const notice = new Notice(t("notices.connectionTesting"), 0);
					const result = await provider.testConnection?.();
					notice.hide();
					new Notice(result?.message ?? (result?.ok ? t("notices.connectionSuccess") : t("notices.connectionFailed")));
				}),
			);
	}

	private renderFlomoProvider(parentEl: HTMLElement, config: FlomoProviderConfig): void {
		const containerEl = this.openCollapsibleCard(
			parentEl,
			config.displayName || t("brands.flomo"),
			config,
		);
		const intro = containerEl.createEl("p");
		intro.appendText(
			t("providers.flomoIntro", { provider: FLOMO_NAME }) + " ",
		);
		intro
			.createEl("a", {
				text: t("providers.getToken"),
				href: FLOMO_TOKEN_HELP_URL,
			})
			.setAttr("target", "_blank");

		new Setting(containerEl).setName(t("settings.labels.displayName")).addText((text) =>
			text.setValue(config.displayName).onChange(async (v) => {
				config.displayName = v.trim() || t("brands.flomo");
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.apiToken"))
			.setDesc(t("settings.descriptions.apiToken"))
			.addText((text) => {
				text.inputEl.type = "password";
				text.setValue(config.apiToken ?? "").onChange(async (v) => {
					config.apiToken = v.trim() || undefined;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("settings.labels.writeToolName"))
			.setDesc(t("settings.descriptions.writeToolName"))
			.addText((text) =>
				text
					.setValue(config.writeToolName ?? "")
					.onChange(async (v) => {
						config.writeToolName = v.trim() || undefined;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("settings.labels.enabled")).addToggle((tog) =>
			tog.setValue(config.enabled).onChange(async (v) => {
				config.enabled = v;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.testConnection"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.test")).onClick(async () => {
					const provider = this.plugin.registry.get(config.id) as FlomoProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const notice = new Notice(t("notices.connectionTesting"), 0);
					const result = await provider.testConnection?.();
					notice.hide();
					new Notice(result?.message ?? (result?.ok ? t("notices.connectionSuccess") : t("notices.connectionFailed")));
				}),
			);
	}

	private renderYinxiangProvider(parentEl: HTMLElement, config: YinxiangProviderConfig): void {
		const containerEl = this.openCollapsibleCard(
			parentEl,
			config.displayName || t("brands.yinxiang"),
			config,
		);
		const intro = containerEl.createEl("p");
		intro.appendText(t("providers.yinxiangIntro", { provider: YINXIANG_NAME }) + " ");
		intro.createEl("a", {
			text: t("providers.getYinxiangToken"),
			href: YINXIANG_OAUTH_URL,
		}).setAttr("target", "_blank");

		new Setting(containerEl).setName(t("settings.labels.displayName")).addText((text) =>
			text.setValue(config.displayName).onChange(async (v) => {
				config.displayName = v.trim() || t("brands.yinxiang");
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.apiKey"))
			.setDesc("Paste the token starting with S=s from the OAuth page above.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setValue(config.apiKey ?? "").onChange(async (v) => {
					config.apiKey = v.trim() || undefined;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("settings.labels.defaultFolderId"))
			.setDesc("Optional. Notebook GUID for new notes. Leave empty for the default notebook.")
			.addText((text) =>
				text
					.setValue(config.defaultNotebookGuid ?? "")
					.onChange(async (v) => {
						config.defaultNotebookGuid = v.trim() || undefined;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("settings.labels.enabled")).addToggle((tog) =>
			tog.setValue(config.enabled).onChange(async (v) => {
				config.enabled = v;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("settings.labels.testConnection"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.test")).onClick(async () => {
					const provider = this.plugin.registry.get(config.id) as YinxiangProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const notice = new Notice(t("notices.connectionTesting"), 0);
					const result = await provider.testConnection?.();
					notice.hide();
					new Notice(result?.message ?? (result?.ok ? t("notices.connectionSuccess") : t("notices.connectionFailed")));
				}),
			);
	}

	private showYoudaoInstallNotice(reason: string): void {
		new Notice(
			`${reason}\nInstall: ${YOUDAO_INSTALL_CMD}\nWindows: ${YOUDAO_INSTALL_GUIDE}`,
			15000,
		);
	}

	private renderBearProvider(parentEl: HTMLElement, config: BearProviderConfig): void {
		const containerEl = this.openCollapsibleCard(
			parentEl,
			config.displayName || t("brands.bear"),
			config,
		);

		const desc = containerEl.createEl("p");
		desc.setText(t("providers.bearDescription", { provider: BEAR_NAME }));

		new Setting(containerEl)
			.setName(t("settings.labels.displayName"))
			.addText((text) =>
				text.setValue(config.displayName).onChange(async (v) => {
					config.displayName = v.trim() || t("brands.bear");
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("settings.labels.transport"))
			.setDesc(t("providers.bearTransportDesc"))
			.addDropdown((dd) =>
				dd
					.addOptions({ auto: t("settings.options.auto"), cli: t("settings.options.bearCli"), url: t("settings.options.urlScheme") })
					.setValue(config.transport ?? "auto")
					.onChange(async (v) => {
						config.transport = v as BearProviderConfig["transport"];
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		const transport = config.transport ?? "auto";
		if (transport !== "url") {
			if (!config.cli) config.cli = { binPath: DEFAULT_BEARCLI_PATH };
			const cli = config.cli;

			new Setting(containerEl)
				.setName(t("settings.labels.cliBinary"))
				.setDesc(t("settings.descriptions.cliBinary", { provider: `${BEAR_NAME}.app on macOS` }))
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_BEARCLI_PATH)
						.setValue(cli.binPath ?? "")
						.onChange(async (v) => {
							cli.binPath = v.trim();
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName(t("settings.labels.detectCli"))
				.setDesc(t("settings.descriptions.detectCli"))
				.addButton((btn) =>
					btn.setButtonText(t("settings.buttons.detect")).onClick(async () => {
						const provider = this.plugin.registry.get(config.id) as BearProvider | null;
						if (!provider) {
							new Notice(t("providers.notEnabled"));
							return;
						}
						const result = await provider.detectCli();
						if (result.installed) {
							new Notice(
								t("notices.cliDetected", {
									version: `bearcli ${result.version ?? ""}`,
									path: result.resolvedPath ? ` at ${result.resolvedPath}` : "",
								}).trim(),
								8000,
							);
						} else {
							new Notice(result.message ?? "bearcli not found", 12000);
						}
					}),
				);
		}

		new Setting(containerEl)
			.setName(t("settings.labels.enabled"))
			.setDesc(t("settings.descriptions.enabled", { provider: BEAR_NAME }))
			.addToggle((tog) =>
				tog.setValue(config.enabled).onChange(async (v) => {
					config.enabled = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("settings.labels.testConnection"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.buttons.test")).onClick(async () => {
					const provider = this.plugin.registry.get(config.id) as BearProvider | null;
					if (!provider) {
						new Notice(t("providers.notEnabled"));
						return;
					}
					const result = await provider.testConnection?.();
					new Notice(result?.message ?? (result?.ok ? `${BEAR_NAME} is reachable` : `${BEAR_NAME} is not available`));
				}),
			);
	}
}
