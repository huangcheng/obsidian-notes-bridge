import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	classifyOctopHttpError,
	extractDocumentId,
	extractOctopDetails,
	isCleartextNonLoopback,
	normalizeOctopBaseUrl,
	parseOctopBaseUrl,
	sanitizeOctopDetails,
	sanitizeOctopDocumentName,
} from "./helpers";

test("normalizeOctopBaseUrl strips trailing slashes and trims", () => {
	assert.equal(normalizeOctopBaseUrl("  http://localhost:5174/api/// "), "http://localhost:5174/api");
});

test("parseOctopBaseUrl rejects non-http schemes", () => {
	assert.equal(parseOctopBaseUrl("ftp://example.com/api"), null);
	assert.ok(parseOctopBaseUrl("https://example.com/api"));
});

test("isCleartextNonLoopback detects LAN http risk", () => {
	assert.equal(isCleartextNonLoopback("http://localhost:5174/api"), false);
	assert.equal(isCleartextNonLoopback("http://127.0.0.1:5174/api"), false);
	assert.equal(isCleartextNonLoopback("http://192.168.1.10:5174/api"), true);
	assert.equal(isCleartextNonLoopback("https://192.168.1.10:5174/api"), false);
});

test("sanitizeOctopDocumentName strips path chars and falls back", () => {
	assert.equal(sanitizeOctopDocumentName("a/b\\c"), "abc");
	assert.equal(sanitizeOctopDocumentName("   "), "untitled");
});

test("classifyOctopHttpError maps AUTH_FAILED and prerequisites by code", () => {
	assert.equal(
		classifyOctopHttpError(401, { error: { code: "AUTH_FAILED" } }, "login"),
		"authFailed",
	);
	assert.equal(
		classifyOctopHttpError(409, { error: { code: "KNOWLEDGE_PREREQUISITES_FAILED" } }),
		"prerequisites",
	);
});

test("classifyOctopHttpError maps 404 by route context", () => {
	assert.equal(classifyOctopHttpError(404, null, "listKbs"), "wrongBaseUrl");
	assert.equal(classifyOctopHttpError(404, null, "document"), "notFound");
});

test("classifyOctopHttpError maps status fallbacks", () => {
	assert.equal(classifyOctopHttpError(403, null), "forbidden");
	assert.equal(classifyOctopHttpError(413, null), "tooLarge");
	assert.equal(classifyOctopHttpError(422, null), "validation");
	assert.equal(classifyOctopHttpError(429, null), "rateLimited");
	assert.equal(classifyOctopHttpError(502, null), "serverError");
});

test("sanitizeOctopDetails strips controls and truncates", () => {
	assert.equal(sanitizeOctopDetails("ok\nline", 10).includes("\n"), false);
	assert.ok(sanitizeOctopDetails("x".repeat(300), 200).endsWith("…"));
});

test("extractOctopDetails reads error.message", () => {
	assert.equal(
		extractOctopDetails({ error: { code: "KNOWLEDGE_PREREQUISITES_FAILED", message: "deps" } }),
		"deps",
	);
});

test("extractDocumentId accepts top-level and nested ids", () => {
	assert.equal(extractDocumentId({ id: "A", document_id: "B" }), "A");
	assert.equal(extractDocumentId({ document_id: "B" }), "B");
	assert.equal(extractDocumentId({ data: { id: "C" } }), "C");
	assert.equal(extractDocumentId({}), "");
});
