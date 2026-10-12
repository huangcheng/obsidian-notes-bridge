/**
 * Serialized persist queue for plugin data.json writes.
 * All settings and Octop auth mutations should enqueue here so concurrent
 * saves cannot clobber each other via last-write-wins races.
 */
export class PluginSaveQueue {
	private chain: Promise<void> = Promise.resolve();

	constructor(private readonly persist: () => Promise<void>) {}

	/**
	 * Run an optional mutator, then persist. Mutations should touch the
	 * live in-memory settings object held by the plugin.
	 */
	enqueue(mutator?: () => void | Promise<void>): Promise<void> {
		const run = this.chain.then(async () => {
			await mutator?.();
			await this.persist();
		});
		// Keep the chain alive after failures so later saves still run.
		this.chain = run.catch(() => undefined);
		return run;
	}

	/** Wait for in-flight saves (best-effort unload drain). */
	async drain(): Promise<void> {
		await this.chain;
	}
}
