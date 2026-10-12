# Octop export provider design audit — final synthesis (R6)

Date: 2026-10-12
Models (via `pi`): MiniMax-M3, MiMo-v2.6-pro, Step-5-preview, Qwen3.8-max, DeepSeek-v4.1-flash, GLM-5.3, Kimi-k3
Raw replies: docs/audit/*.txt (prior: docs/audit/archive/2026-10-12-r{1..5}/)

## Verdicts (round 6)

| Model | Verdict |
|---|---|
| minimax-m3 | GO WITH FIXES (mobile / save-queue enforcement / small auth semantics) |
| mimo-v26-pro | GO WITH FIXES (thorough; residual polish) |
| stepfun-5 | GO WITH FIXES (sound; release gate correctly defers unverified create) |
| qwen38-max | **GO** (structural issues closed; remainder = accepted v1 / polish) |
| deepseek-v41-flash | GO WITH FIXES (fingerprint-as-hash debate; unverified create) |
| glm-53 | GO WITH FIXES — **“implementation-ready”** on auth/persistence/errors |
| kimi-k3 | GO WITH FIXES — **“mature / consistent”**; save-queue migration underspecified as checklist |

**NO-GO count: 0** (all six rounds).

**Overall: GO for implementation.**  
Pure unanimous `GO` did not appear (panel bias toward GO WITH FIXES even when naming only accepted-v1 items). Structural consensus has held since R2; R5–R6 closed the last real contradiction (memory-only fingerprint vs persisted `authFailed`). Remaining “fixes” are either already listed under **Accepted v1 limitations** or implement-time checklists (enumerate `saveData` call sites).

## Consensus locked into the design

1. Separate `data.octopAuth[configId]` + shared serialized save queue  
2. Persisted `credentialsFingerprint` + clear-on-credential-change  
3. Seamless JWT: login → cache → 401 re-login; sliding renew opportunistic  
4. Create via `documents/text` (expect 201 + id); always “sent for processing”  
5. Error enum + i18n; map `KNOWLEDGE_PREREQUISITES_FAILED` off the auth path  
6. Batch: single-flight login, negative-cache on unreachable, breaker fail-fast  
7. Disclosure-only password storage; README + settings Sync warning  
8. Release gate: E2E when Octop `prerequisites_ok`

## Split opinions (left to user; not blocking)

- Whether a SHA-256 credential fingerprint is “not a secret” enough to persist — design keeps it (needed for breaker correctness); disclosure covers Sync of JWT/password already.
- Opt-in “don’t store password” / keychain — deferred (user chose seamless A).
- Memory-only JWT — rejected earlier for cold-start UX.

## Applied

Live design: `docs/superpowers/specs/2026-10-12-octop-export-provider-design.md`  
Snapshot this round: `docs/audit/target.md`
