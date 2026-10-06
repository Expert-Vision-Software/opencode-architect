# V2-native only — drop v1 hosts

opencode v2 replaced the extension SDK: v1 plugin implementations do not run
under a v2 host, and every API fact our suite teaches changed shape (config
keys, hook families, registration mechanics — all adjudicated in the
verified-facts record, `docs/reference/opencode-v2-facts.md`). Maintaining a
dual-target package would keep a dead code path alive for consumers who never
launch a v1 host, while the teaching surface — our actual product — cannot
serve both vocabularies at once. The decision: **the released package targets
the opencode v2 line only.** No dual entrypoint, no v1 host support; released
as 1.0.0.

Concretely, the plugin registers through the v2 Effect-first API: the entry
default-exports a plugin definition `{ id, effect }`
(`@opencode/plugin/effect`, `Plugin.define`), agents are injected via the
agent-domain transform, and the external-directory permission ask is
re-derived as a permission `evaluate` hook (facts §1, §2, §3, §4; confirmed
by the verification harness, `tests/v2-host.test.ts`). Consumer registrations
are written to the v2 `plugins` config key; legacy v1 `plugin` entries are
tolerated read-only with an upgrade advisory — never migrated silently, never
written back (facts §7). Generated packages must declare
`exports["./server"]`: the root-index fallback is runtime-dependent and dead
on Bun 1.3.x, so an undeclared entry disables the plugin at the entry stage
(facts §13 row 9, §14.6; `harness: tests/v2-host.test.ts`).

The guidance suite is rewritten in place — references, oneshots, conformance
checklist — with no v1 archive: git history is the archive. Guidance may
teach v1 names only inside explicit v1→v2 migration mappings (facts §9), so
consumers upgrading get a translation table, not a second dialect. Every
changed fact traces to the verified-facts record; the docs-fact gate
(`tests/docs-fact-gate.test.ts`) enforces this in CI.

Supersedes the v1-loader mechanism claims in ADR-0010 and the entry-resolution
claims in ADR-0011 (both carry superseding notes; their structural rules
survive under the v2 contract).

## Considered Options

- Dual v1/v2 entrypoints or dual-key config writes (rejected): the v1 host
  and its SDK are dead ends; the cost is two teaching surfaces and two
  installers for one product
- Silent migration of legacy `plugin` entries (rejected): rewriting consumer
  configs behind their back violates the surgical-writer invariants (B5);
  read-only tolerance plus an advisory keeps the consumer in control
- Keeping v1 guidance pages as an archive (rejected): stale pages get cited;
  git history is the archive
- Pinning consumer installs to the adjudication-time package versions
  (rejected, facts §15): consumer-facing guidance and templates use `@latest`
  so generated packages resolve current versions at time of use; only the
  runtime pins what it executes

## Consequences

- The package declares a v2-only host contract; consumers on v1 hosts must
  stay on a pre-1.0 release
- ADR-0010/0011 keep their structural decisions but lose their v1 loader
  justifications; the v2 default-export contract (`{ id, effect|setup }`,
  facts §2) and the mandatory `exports["./server"]` declaration replace them
- The docs-fact gate blocks known-false v1 claims from re-entering
  `references/`; new contradictions are adjudicated by extending §13 of the
  verified-facts record, not resolved locally
- Effect-first is the house style for our plugin, templates, examples, and
  the upgrade path's default port target; the Promise API is documented as
  the fallback for trivial plugins, and general Effect-TS teaching defers to
  the repo's effect-ts skill
