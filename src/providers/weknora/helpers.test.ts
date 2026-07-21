import { strict as assert } from "node:assert";
import { test } from "node:test";
import { describeWeknoraHttpError, normalizeWeknoraBaseUrl } from "./helpers";

test("normalizeWeknoraBaseUrl passes through a clean URL", () => {
	assert.equal(
		normalizeWeknoraBaseUrl("http://localhost:8080/api/v1"),
		"http://localhost:8080/api/v1",
	);
});

test("normalizeWeknoraBaseUrl strips trailing slashes", () => {
	assert.equal(
		normalizeWeknoraBaseUrl("http://localhost:8080/api/v1///"),
		"http://localhost:8080/api/v1",
	);
});

test("normalizeWeknoraBaseUrl trims surrounding whitespace", () => {
	assert.equal(
		normalizeWeknoraBaseUrl("   https://demo.example.com/api/v1  "),
		"https://demo.example.com/api/v1",
	);
});

test("normalizeWeknoraBaseUrl returns empty string for empty input", () => {
	assert.equal(normalizeWeknoraBaseUrl(""), "");
	assert.equal(normalizeWeknoraBaseUrl("   "), "");
});

test("describeWeknoraHttpError maps 401 to auth message", () => {
	assert.equal(
		describeWeknoraHttpError(401, null),
		"WeKnora rejected the API key.",
	);
});

test("describeWeknoraHttpError maps 403 to scope message", () => {
	assert.equal(
		describeWeknoraHttpError(403, null),
		"API key lacks permission (needs full access or the ingest capability, and access to this knowledge base).",
	);
});

test("describeWeknoraHttpError maps 404 to missing knowledge base", () => {
	assert.equal(
		describeWeknoraHttpError(404, null),
		"Knowledge base not found.",
	);
});

test("describeWeknoraHttpError maps 409 to duplicate", () => {
	assert.equal(
		describeWeknoraHttpError(409, { code: 1005 }),
		"Document already exists in this knowledge base.",
	);
});

test("describeWeknoraHttpError maps 413 to too large", () => {
	assert.equal(
		describeWeknoraHttpError(413, null),
		"Note is too large for the WeKnora server limit.",
	);
});

test("describeWeknoraHttpError maps 429 to rate limit", () => {
	assert.equal(
		describeWeknoraHttpError(429, null),
		"WeKnora rate-limited the request.",
	);
});

test("describeWeknoraHttpError maps 5xx to server error with status", () => {
	assert.equal(
		describeWeknoraHttpError(502, null),
		"WeKnora server error (status 502).",
	);
});

test("describeWeknoraHttpError maps unknown 4xx to generic with status", () => {
	assert.equal(
		describeWeknoraHttpError(418, null),
		"WeKnora request failed (status 418).",
	);
});
