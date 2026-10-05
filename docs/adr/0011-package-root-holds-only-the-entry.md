# Package root holds only the entry

OpenCode's loader needs exactly one thing from a plugin package's root: the
entry module (`index.ts`, resolved via `exports["./server"]`, `main`, or the
directory-index fallback). Every other code file at the root is convention
weight with no loader meaning, and it blurs the line between the
loader-facing surface and the implementation. The suite therefore keeps the
root minimal: **`index.ts` is the only TypeScript file at the package
root; every other module — the hook (`src/plugin.ts`), installer, CLI,
helpers — lives under `src/`.**

This repo's own package follows the rule (`src/plugin.ts`), and the
packager/publisher templates emit it for generated packages (their hook
template lands at `src/plugin.ts`; `index.ts` re-exports from
`./src/plugin.ts`). A root-level `plugin.ts` from packages built before
this decision is recognized as a legacy location during merges, migration,
and audits — the same treatment as the legacy `assets/` wrapper — but is
non-conformant for anything built or audited against this checklist
(E4).

## Considered Options

- `plugin.ts` at the package root (rejected): the pre-0.8.1 layout of this
  package and of generated packages — no loader benefit, and it reads as a
  second entry point alongside `index.ts`
- A root `plugin/` directory (rejected): same ambiguity with more
  scaffolding; `src/` already holds all implementation modules
- Leaving the location free and enforcing only the thin-hook rule
  (rejected): audits were inconsistent about where the hook belongs, and
  hook templates carried root-relative `import.meta.dirname` arithmetic
  (agents dir, `package.json` read) that silently breaks when the file
  moves — a fixed location makes those paths reviewable

## Consequences

- Hook, installer, and CLI templates resolve package-root resources
  (bundled content directories, `package.json`) via `../` from `src/`
- Generated-package `files` whitelists no longer name `plugin.ts` — `src`
  covers it
- Merges into a target root that already holds a legacy `plugin.ts` are a
  structural conflict routed to `opencode-plugin-engineer`, same as before
- The conformance checklist's E4 item audits the root surface; the
  packager's self-audit gate verifies `index.ts` is the only root code file
