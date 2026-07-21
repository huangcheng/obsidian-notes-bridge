import { Provider } from "./provider";

export type ProviderKind = "cli" | "mcp" | "http" | "bear" | "wps" | "youdao" | "flomo" | "yinxiang" | "weknora";

export interface ProviderConfigBase {
	id: string;
	kind: ProviderKind;
	displayName: string;
	enabled: boolean;
}

export interface ProviderFactory<C extends ProviderConfigBase = ProviderConfigBase> {
	kind: C["kind"];
	create(config: C): Provider | null;
}

/**
 * Minimal in-memory registry. Loaded from `data.json` at plugin start;
 * UI mutations write back through the host plugin's `saveData`.
 */
export class ProviderRegistry {
	private readonly factories = new Map<ProviderKind, ProviderFactory>();
	private readonly configs = new Map<string, ProviderConfigBase>();
	private readonly instances = new Map<string, Provider>();

	registerFactory<C extends ProviderConfigBase>(factory: ProviderFactory<C>): void {
		this.factories.set(factory.kind, factory as ProviderFactory);
	}

	loadConfigs(configs: ProviderConfigBase[]): void {
		this.configs.clear();
		for (const c of configs) this.configs.set(c.id, c);
		// Drop cached instances whose config disappeared; keep others so live
		// connections aren't torn down on every saveSettings.
		for (const id of Array.from(this.instances.keys())) {
			if (!this.configs.has(id)) this.instances.delete(id);
		}
	}

	listConfigs(): ProviderConfigBase[] {
		return Array.from(this.configs.values());
	}

	getConfig(id: string): ProviderConfigBase | undefined {
		return this.configs.get(id);
	}

	upsertConfig(config: ProviderConfigBase): void {
		this.configs.set(config.id, config);
		this.instances.delete(config.id);
	}

	removeConfig(id: string): void {
		const inst = this.instances.get(id);
		if (inst?.dispose) {
			void Promise.resolve(inst.dispose()).catch(() => {});
		}
		this.configs.delete(id);
		this.instances.delete(id);
	}

	get(id: string): Provider | null {
		const cached = this.instances.get(id);
		if (cached) return cached;
		const cfg = this.configs.get(id);
		if (!cfg || !cfg.enabled) return null;
		const factory = this.factories.get(cfg.kind);
		if (!factory) return null;
		const provider = factory.create(cfg);
		if (!provider) return null;
		this.instances.set(id, provider);
		return provider;
	}

	listEnabledProviders(): Provider[] {
		const out: Provider[] = [];
		for (const cfg of this.configs.values()) {
			const p = this.get(cfg.id);
			if (p) out.push(p);
		}
		return out;
	}

	/** Same as `listEnabledProviders` but filters out providers whose `available()` reports false. */
	listAvailableProviders(): Provider[] {
		return this.listEnabledProviders().filter((p) => p.available?.().ok ?? true);
	}

	disposeAll(): void {
		for (const inst of this.instances.values()) {
			if (inst.dispose) {
				void Promise.resolve(inst.dispose()).catch(() => {});
			}
		}
		this.instances.clear();
	}
}
