# Live knowledge fallback

Shared procedure for answering questions beyond the bundled references (SDK
features, new opencode APIs, config fields not covered locally). Follows the
repo's source-of-truth ladder from `docs/reference/opencode-v2-facts.md`.

1. **Verified-facts record first.** If `docs/reference/opencode-v2-facts.md`
   settles the question, answer from it and cite the section (e.g. "per
   opencode-v2-facts §8").
2. **Pinned source second.** For anything unsettled, read
   `anomalyco/opencode` at the pinned tag (the exact commit is in the
   record's header); cite `source: <path>#<Symbol>`. Source outranks docs.
3. **Official v2 docs third.** Only `opencode.ai/v2/docs/...` pages count as
   official v2 docs; in-repo docs are partially stale (facts §13). When a
   doc contradicts source, source wins and the contradiction is adjudicated
   by extending §13 — never resolved locally.
4. **DeepWiki last.** Tertiary; never for anything the first three settle.
5. **Degrade gracefully.** When no authoritative source is available, state
   clearly that the answer is unverified and keep it out of guidance; never
   block on live lookups.

Primary agents pass this instruction to subagents in delegation prompts when
the subagent's task may need live lookups.
