import {
	FetchOptions,
	ListOptions,
	NormalizedNote,
	Provider,
	ProviderAvailability,
	ProviderCapabilities,
	RemoteListItem,
} from "../provider";
import { ProviderConfigBase, ProviderFactory } from "../registry";
import { bearOpenDelayMs, delay, dispatchToBear } from "./export";
import { bearCallbackToNote, initiateBearImport } from "./import";
import { bearAvailable, parseBearCallback } from "./url-scheme";

export interface BearProviderConfig extends ProviderConfigBase {
	kind: "bear";
}

export const DEFAULT_BEAR_CONFIG: Omit<BearProviderConfig, "id" | "displayName"> = {
	kind: "bear",
	enabled: true,
	trusted: true,
};

interface PendingFetch {
	resolve: (note: NormalizedNote) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
	signalCleanup?: () => void;
}

const FETCH_TIMEOUT_MS = 60_000;

/**
 * Wraps Bear's `bear://x-callback-url` round-trip behind the `Provider`
 * contract. `fetch` defers to the OS-level callback resolved via
 * `handleCallback`, which the plugin wires from its
 * `obsidian://bear-callback` protocol handler.
 */
export class BearProvider implements Provider {
	readonly id: string;
	readonly displayName: string;
	readonly icon = "book-open";
	readonly capabilities: ProviderCapabilities = {
		canImport: true,
		canExport: true,
		supportsBulk: true,
		supportsAttachments: false,
	};

	private readonly pending = new Map<string, PendingFetch>();
	private dispatchQueue: Promise<void> = Promise.resolve();

	constructor(config: BearProviderConfig) {
		this.id = config.id;
		this.displayName = config.displayName || "Bear";
	}

	available(): ProviderAvailability {
		return bearAvailable()
			? { ok: true }
			: { ok: false, reason: "Bear is macOS / iOS only" };
	}

	async push(note: NormalizedNote): Promise<{ remoteId: string }> {
		if (!bearAvailable()) {
			throw new Error("Bear export is only available on macOS / iOS");
		}
		const prev = this.dispatchQueue;
		let release: () => void = () => {};
		this.dispatchQueue = new Promise<void>((r) => {
			release = r;
		});
		await prev;
		try {
			dispatchToBear({
				title: note.title,
				body: note.body,
				tags: note.tags,
				openNote: false,
			});
			await delay(bearOpenDelayMs());
			return { remoteId: "" };
		} finally {
			release();
		}
	}

	fetch(remoteId: string, opts?: FetchOptions): Promise<NormalizedNote> {
		if (!bearAvailable()) {
			return Promise.reject(new Error("Bear import is only available on macOS / iOS"));
		}
		if (this.pending.has(remoteId)) {
			return Promise.reject(new Error(`Bear fetch already in progress for ${remoteId}`));
		}
		return new Promise<NormalizedNote>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(remoteId);
				reject(new Error(`Bear fetch timed out for ${remoteId}`));
			}, FETCH_TIMEOUT_MS);

			const entry: PendingFetch = { resolve, reject, timer };
			if (opts?.signal) {
				const onAbort = () => {
					this.pending.delete(remoteId);
					clearTimeout(timer);
					reject(new Error("Cancelled"));
				};
				opts.signal.addEventListener("abort", onAbort, { once: true });
				entry.signalCleanup = () =>
					opts.signal?.removeEventListener("abort", onAbort);
			}
			this.pending.set(remoteId, entry);
			initiateBearImport(remoteId);
		});
	}

	/**
	 * Resolve the in-flight fetch for the note Bear just round-tripped.
	 * Wired from the plugin's `obsidian://bear-callback` handler.
	 */
	handleCallback(searchParams: string): void {
		const parsed = parseBearCallback(searchParams);
		const id = parsed.identifier ?? "";

		let key: string | undefined;
		let entry = this.pending.get(id);
		if (entry) {
			key = id;
		} else if (this.pending.size === 1) {
			// Bear normally returns identifier; fall back to the only in-flight fetch
			// for the rare case where it doesn't.
			key = this.pending.keys().next().value as string;
			entry = this.pending.get(key);
		}
		if (!entry || key === undefined) return;

		this.pending.delete(key);
		clearTimeout(entry.timer);
		entry.signalCleanup?.();

		if (!parsed.success) {
			entry.reject(
				new Error(parsed.errorMessage ?? `Bear error ${parsed.errorCode ?? "unknown"}`),
			);
			return;
		}
		const note = bearCallbackToNote(parsed);
		if (!note) {
			entry.reject(new Error("Bear returned an empty note. The note may be encrypted."));
			return;
		}
		entry.resolve(note);
	}

	listRemote(_opts?: ListOptions): Promise<RemoteListItem[]> {
		// Bear's x-callback-url surface has no list endpoint. Importing
		// requires the user to know the note id; the BearImportModal asks
		// for it directly.
		return Promise.resolve([]);
	}

	testConnection(): Promise<{ ok: boolean; message?: string }> {
		return Promise.resolve(
			bearAvailable()
				? { ok: true, message: "Bear is reachable on this OS" }
				: { ok: false, message: "Bear is macOS / iOS only" },
		);
	}

	dispose(): void {
		for (const entry of this.pending.values()) {
			clearTimeout(entry.timer);
			entry.signalCleanup?.();
			entry.reject(new Error("BearProvider disposed"));
		}
		this.pending.clear();
	}
}

export const bearFactory: ProviderFactory<BearProviderConfig> = {
	kind: "bear",
	create(config) {
		return new BearProvider(config);
	},
};
