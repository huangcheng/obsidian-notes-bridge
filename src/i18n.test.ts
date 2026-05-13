import { describe, it } from "node:test";
import assert from "node:assert";
import { en } from "./i18n/locales/en";
import { zh } from "./i18n/locales/zh";
import { initializeI18n, t } from "./i18n";

function getAllKeys(obj: unknown, prefix = ""): string[] {
	const keys: string[] = [];
	for (const [k, v] of Object.entries(obj ?? {})) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (typeof v === "string") {
			keys.push(path);
		} else if (v && typeof v === "object") {
			keys.push(...getAllKeys(v, path));
		}
	}
	return keys;
}

describe("i18n", () => {
	describe("locale consistency", () => {
		it("zh has exactly the same keys as en", () => {
			const enKeys = getAllKeys(en).sort();
			const zhKeys = getAllKeys(zh).sort();
			assert.deepStrictEqual(zhKeys, enKeys);
		});
	});

	describe("t()", () => {
		it("returns English string when locale is en", () => {
			const originalWarn = console.warn;
			console.warn = () => {};
			initializeI18n("en");
			assert.strictEqual(t("commands.copyAsMarkdown"), "Copy as pure Markdown");
			console.warn = originalWarn;
		});

		it("returns Chinese string when locale is zh", () => {
			const originalWarn = console.warn;
			console.warn = () => {};
			initializeI18n("zh");
			assert.strictEqual(t("commands.copyAsMarkdown"), "复制为纯 Markdown");
			console.warn = originalWarn;
		});

		it("falls back to English for unsupported locales", () => {
			const originalWarn = console.warn;
			console.warn = () => {};
			initializeI18n("fr");
			assert.strictEqual(t("commands.copyAsMarkdown"), "Copy as pure Markdown");
			console.warn = originalWarn;
		});

		it("interpolates parameters", () => {
			const originalWarn = console.warn;
			console.warn = () => {};
			initializeI18n("en");
			assert.strictEqual(
				t("notices.exportFailed", { error: "disk full" }),
				"Export failed: disk full",
			);
			console.warn = originalWarn;
		});

		it("leaves missing parameters as placeholders", () => {
			const originalWarn = console.warn;
			console.warn = () => {};
			initializeI18n("en");
			assert.strictEqual(t("notices.exportFailed", {}), "Export failed: {{error}}");
			console.warn = originalWarn;
		});

		it("returns key name for missing keys", () => {
			const warnings: string[] = [];
			const originalWarn = console.warn;
			console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
			initializeI18n("en");
			// @ts-expect-error testing invalid key
			assert.strictEqual(t("nonexistent.key"), "nonexistent.key");
			assert.strictEqual(warnings[0], "[i18n] Missing translation key: nonexistent.key");
			console.warn = originalWarn;
		});
	});
});
