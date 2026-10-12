# Role
Audit the attached Advanced Import/Export (Obsidian community plugin) design doc only. Do not write code. Do not call tools.

Advanced Import/Export = TypeScript Obsidian plugin that exports notes via providers (Bear, WeKnora, Flomo, etc.). This design adds a push-only Octop knowledge-base export provider with username/password → JWT auth, settings card, and `documents/text` ingest — mirroring the existing WeKnora provider.

# Required output format
1. Verdict: GO / GO WITH FIXES / NO-GO — one sentence
2. Critical risks (auth/credential storage, JWT cache lifecycle, settings persistence races, error contracts especially KNOWLEDGE_PREREQUISITES_FAILED, Obsidian requestUrl header limitations, mobile)
3. Contradictions or stale claims
4. Missing requirements (first-ship must-haves for a safe export provider)
5. Architecture/design notes (provider boundaries, auth helper vs provider, config migration, i18n, parity with WeKnora)
6. Top 5 concrete edits

Under 450 words. Be skeptical and specific.
