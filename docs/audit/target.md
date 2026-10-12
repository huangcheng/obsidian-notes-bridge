# Octop Export Provider — Design

Date: 2026-10-12
Status: Implementation-ready (R1–R4 audits; no NO-GO; residual nits closed below)

## Summary

Push-only Octop knowledge-base export for the Advanced Import/Export Obsidian plugin. Configure API base URL + username/password + default KB; export notes as Markdown via `documents/text`. Auth is seamless JWT (login → cache → 401 re-login). Mirrors WeKnora’s provider shape with a dedicated auth store.

## Decisions

| Topic | Choice |
|---|---|
| Direction | Export only |
| Auth | Username/password → JWT (no pasted token) |
| JWT storage | Persisted in `data.octopAuth[configId]`, separate from settings-card fields |
| KB selection | Default per config |
| Ingest | JSON `POST .../documents/text` |
| Duplicates | Create-new each export (no overwrite API) |
| Capability | Test connection checks it; push maps 409 |
| Password UX | Disclosure-only (Sync risk); no keychain in v1 |
| Sliding renew | Best-effort only; **401 re-login is authoritative** |

## API contract

### Evidence

| Claim | Evidence |
|---|---|
| Login OK / `expires_in` seconds (86400) | Observed |
| Login fail HTTP 401 `{ error: { code: "AUTH_FAILED" } }` | Observed |
| Capability has `usable` **and** `prerequisites_ok` | Observed |
| List KBs: array of `{ id, name, ... }` | Observed |
| Create → HTTP **201** + `_row_payload` (`id`, `document_id`, `status`, …) | Octop source |
| 409 `KNOWLEDGE_PREREQUISITES_FAILED` | Observed |
| `X-Octop-Access-Token` sliding renew | Octop source only; optional client path |
| Live create 201 on verification host | Blocked until `prerequisites_ok` — **release gate** |

Base URL example: `http://localhost:5174/api` (must include `/api`; no auto-append). Loopback cleartext OK; warn on `http:` + non-loopback. Reject non-`http(s)` schemes.

### Endpoints used

- `POST {base}/auth/login` `{ username, password }`
- `GET {base}/knowledge-bases/capability` — Test connection: if `usable === false` → `capabilityUnavailable` (wins); else if `!prerequisites_ok` → `prerequisites`; else OK
- `GET {base}/knowledge-bases`
- `POST {base}/knowledge-bases/{id}/documents/text` `{ name: <stem>, format: "md", content }` → expect **201** with `id` (or `document_id`)

## Errors

Parse order: `error.code` → HTTP status → `detail` / non-JSON → generic. Mapper returns a **stable code enum**; UI maps to i18n (no server strings interpolated unsanitized; `details` may append for prerequisites only).

| Condition | Code / behavior |
|---|---|
| Incomplete config | `incomplete` |
| Login 401 / AUTH_FAILED | `authFailed` + trip breaker |
| Login network/timeout/5xx | `unreachable` / `timeout` — **no breaker** |
| Call 401 | Clear token → single-flight login → retry once; if fresh token still 401 → trip breaker, fail rest of batch |
| 403 | `forbidden` |
| 404 KB document routes | `notFound`; 404 on login / capability / **list KBs** → `wrongBaseUrl` |
| 409 KNOWLEDGE_PREREQUISITES_FAILED | `prerequisites` (+ optional details text) |
| 409 other | `conflict` |
| 413 | `tooLarge` |
| 422 | `validation` |
| 429 | `rateLimited` (per-file; no backoff) |
| 5xx on authed call | `serverError` |
| Soft timeout | `timeout` — **no create retry** (may have succeeded; notice says so) |
| 201 without id/document_id | `createFailed` |
| 201 with id | success **“sent for processing”** always (do not branch on `status`; indexing is async and may flip later) |

## Architecture

```
src/providers/octop/
  types.ts          # OctopProviderConfig, OctopAuthEntry, error codes
  helpers.ts        # normalizeOctopBaseUrl, describeOctopHttpError → code
  auth.ts           # ensureAuth, login, renew adopt, breaker
  octop-provider.ts # Provider + factory
  helpers.test.ts   # pure helper tests (WeKnora precedent)
src/storage/save-queue.ts   # shared serialized load→merge→saveData (settings + auth)
  save-queue.test.ts        # concurrent merge fixtures
```

Also: registry, factories, settings seed, settings card, main command/menu, en/zh, README privacy blurb, brand registry if present.

### Data ownership

```ts
// settings.providers[] — card-owned
interface OctopProviderConfig extends ProviderConfigBase {
  kind: "octop";
  baseUrl?: string;
  username?: string;
  password?: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
}

// data.octopAuth — auth-owned only
interface OctopAuthEntry {
  accessToken?: string;
  accessTokenExpiresAt?: number;      // soft gate; missing/NaN ⇒ treat as expired
  lastKnownExpiresInMs?: number;      // expires_in (seconds) * 1000 from login
  authFailed?: boolean;
  /** Persisted SHA-256 hex of credentials (not a secret). Enables clear-on-change across restarts. */
  credentialsFingerprint?: string;
}
```

Fingerprint = `sha256(JSON.stringify({ baseUrl, username }) + "\0" + password)` (trim username/password before hash; intentional that whitespace edits rotate auth). Never log the fingerprint; safe to persist.

**Single serialized PluginData save queue** (`src/storage/save-queue.ts`, one Promise chain):

1. **Work item:** migrate **every** existing `saveData` call site in the plugin onto this queue (enumerate at implement time). One legacy whole-object save still clobbers `octopAuth`.
2. Enqueue: `loadData` → `mergeSettingsPatch` / `mergeAuthPatch` → `saveData`.
3. Settings patches **preserve** `octopAuth`. Card text fields debounce **500 ms** before enqueue.
4. When a settings patch changes an Octop config’s credentials (`baseUrl`/`username`/`password`), the same merge **clears** `octopAuth[configId]` (token + breaker + fingerprint).
5. Config delete and auth cleanup are **one** merge: remove provider entry **and** `octopAuth[configId]` together (no stranded JWT).
6. Auth patches merge only `octopAuth[configId]`; login completion re-checks fingerprint and **discards** if mismatch or config gone.
7. Renew-adopt: if token string changed **and** `lastKnownExpiresInMs` finite, persist new token **and** `accessTokenExpiresAt = now + lastKnownExpiresInMs` atomically; debounce within a batch.
8. Seed default octop provider when kind missing; persist on next real save.
9. Drain/flush the queue on plugin unload best-effort.

### Auth algorithm

1. Compute current fingerprint. If `octopAuth[configId].credentialsFingerprint` differs (or missing while entry exists) → drop token/breaker and treat as fresh credentials.
2. If `authFailed === true` and fingerprint **equals** stored fingerprint → fail fast. Clear breaker only via credential change (step 1) or **Test connection** start — **not** on every plugin load.
3. Before using a cached token: fingerprint must match **and** `accessTokenExpiresAt` must be finite and `> now + 60s`; else login. Missing expiry ⇒ expired.
4. Single-flight keyed by `configId` + fingerprint.
5. `requestUrl`: `Authorization: Bearer <token>`, `throw: false`, catch → unreachable. Soft timeout `Promise.race` **30s**; ignore late; no create retry.
6. Within one export batch: after login `unreachable`/`timeout`, **negative-cache** that config for the rest of the batch (fail remaining with same code; no per-file re-login storm). Credential breaker still only for definitive auth failure.
7. Opportunistic renew: header present (case-insensitive) + finite `lastKnownExpiresInMs`; else ignore. Unverified on all platforms — **401 path is authoritative**.
8. Secrets never in Notices/reports/logs. Prerequisites `details`: strip controls, truncate **200** chars.

Test connection: clear breaker → ensureAuth → capability (precedence above) → list KBs → `octopTestSuccess` with count.  
Refresh failure: keep last dropdown; `octopRefreshFailed`. Empty list: placeholder.  
Missing/empty `knowledgeBaseId` at export → `incomplete`. Deleted mid-batch → `notFound`.  
Empty note title stem → `"untitled"`.  
Password field: plain Obsidian text Setting (no native password type); label as sensitive; optional show/hide if trivial.

### Push

Stem name, `format: "md"`, transformed body, no `path`. Uses orchestrator concurrency (default **4**, from plugin settings — same path as WeKnora). **Per-file failures never abort the orchestrator batch**; if the credential breaker trips, **remaining files for that config fail fast with `authFailed`** (still per-file results in the summary). Attachments: existing transform settings only; provider does not upload binaries.

### Capabilities

`{ canImport: false, canExport: true, supportsBulk: true, supportsAttachments: false }`  
`listRemote`/`fetch` throw using i18n key `octopReadUnsupported` (export-only guard; no fake import path).

## Settings UX

Card fields as above + Sync disclosure (password **and** JWT may sync) + cleartext/non-loopback warning + mobile localhost caveat. Password: labeled sensitive text Setting (Obsidian has no native password input type).

## Commands

`export-active-to-octop` + Advanced Import/Export context menu. Multi-config → existing FuzzySuggestModal.

## i18n

`octopIncompleteConfig`, `octopAuthFailed`, `octopUnreachable`, `octopForbidden`, `octopNotFound`, `octopWrongBaseUrl`, `octopPrerequisitesFailed`, `octopCapabilityUnavailable`, `octopConflict`, `octopTooLarge`, `octopValidationFailed`, `octopRateLimited`, `octopTimeout`, `octopTimeoutMaybeSent`, `octopServerError`, `octopCreateFailed`, `octopReadUnsupported`, `octopIntro`, `octopNoKb`, `octopCleartextWarning`, `octopSyncWarning`, `octopMobileLocalhostHint`, `octopSentForProcessing`, `octopTestSuccess`, `octopRefreshFailed`, `octopBatchAuthFailed`, `octop` brand.

Stem `name`: bare stem (no `.md`); sanitize by stripping `/\\` and controls; max length 200; empty → `untitled`. iOS ATS may block cleartext LAN `http:` → expect `unreachable` (not `isDesktopOnly`).

## Out of scope / accepted v1 limitations

These are intentional — not open questions:

- No import, multipart, path folders, overwrite/dedupe, OAuth/API keys, keychain
- No 429 backoff; bulk may spam failures on a hot server
- Soft timeout cannot abort the underlying `requestUrl` (possible socket linger)
- Sliding renew may be unavailable via Obsidian headers — 401 path covers it
- Create-new duplicates on re-export; timeout may create orphans
- Disclosure-only credential storage
- Happy-path create unverified until release-gate E2E on a usable Octop

## Security

README + settings: Sync replication of password/JWT; cleartext LAN risk; network only to configured host; no telemetry.

## Testing & release gate

- Unit tests: URL normalize + error-code mapping (WeKnora `helpers.test.ts` pattern — explicit exception to any “E2E-only” global preference for this repo).
- **Ship only after** E2E log artifact under e.g. `/tmp/octop-export-e2e.log` (or vault note) proving: create 201 + id; bulk N files → exactly one login; 401 recovery once; optional renew header presence noted. Until prerequisites healthy: assert clean 409 path.

## Audit

- R1–R5: **0 NO-GO**. Panel habitually returns GO WITH FIXES; structural consensus held from R2+. R5 fixed fingerprint/breaker contradiction via **persisted credentialsFingerprint**, batch negative-cache, save-queue migration work item, renew expiry roll.
- Artifacts: `docs/audit/` + `docs/audit/archive/`.
