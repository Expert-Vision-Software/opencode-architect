# Contributing to opencode-architect

Thanks for helping build the suite. This repo has one non-negotiable rule:
**every OpenCode API fact we teach must be true of opencode v2** — the
package targets the v2 line only (ADR-0012), and our product is teaching, so
a stale fact is a shipped bug.

## Setup

```bash
bun install        # Bun is the runtime and test runner
bun run check      # tsc --noEmit
bun test           # full suite
```

CI runs the same three gates plus the v2 verification harness
(`bun test tests/v2-host.test.ts tests/fixture-config-schema.test.ts`), which
loads the built plugin the way a v2 host does and validates every config
fixture against the pinned `@opencode/schema`.

## The guidance-fact policy

`docs/reference/opencode-v2-facts.md` is the single source of truth for
every OpenCode API fact asserted anywhere in this repo (references,
oneshots, conformance checklist, README, agent definitions, templates):

- Assert a fact only if it is **settled** or **hedged** in that record.
  Open-harness items stay behind an explicit "pending verification" note.
- Cite by section number — e.g. "per opencode-v2-facts §8" — instead of
  restating fragile details.
- New contradictions are adjudicated by extending §13 of that record, never
  resolved locally.
- Consumer-facing guidance names packages with `@latest` (e.g.
  `"@opencode/plugin": "latest"`); only the runtime pins what it executes.

The docs-fact gate (`tests/docs-fact-gate.test.ts`) enforces this in CI: it
fails on known-false v1 claims re-entering `references/` and on
API-teaching references that lack a verified-facts citation.

## Style

- **Effect-first**: our plugin, templates, examples, and generated packages
  use the Effect-based v2 plugin API (`@opencode/plugin/effect`,
  `Plugin.define({ id, effect })`); the Promise API is the documented
  fallback for trivial plugins. General Effect-TS teaching is out of scope
  here — it defers to the repo's effect-ts skill.
- No v1 archive: v1 names appear only inside explicit v1→v2 migration
  mappings. Git history is the archive.
- TypeScript style rules: see `docs/coding-standards.md`.

## Domain docs

Root `CONTEXT.md` is the glossary — use its vocabulary and `_Avoid:` lines.
Decisions land as ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Tests

Tests assert external behavior only — what a consumer or a v2 host can
observe, never internal structure. Existing prior art lives in `tests/`;
migrate it, don't reinvent it.

## Release

Ship via tag push only — GitHub Actions publishes to npm. Never run
`npm publish` locally. See `docs/agents/release.md`.
