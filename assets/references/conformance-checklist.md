# Package conformance checklist

Canonical review criteria for assessing whether an existing plugin package
conforms to this suite's design (ADR 0006: scope-aware, manifest-gated
installation). Review a built package — a repo with `plugin.ts`,
`src/installer.ts`, `assets/`, `package.json` — against every item. Cite
file and line evidence per item; an item with no evidence found is a
finding.

## A. Install mechanics

- **A1 Manifest-gated idempotency.** Installs are gated on
  `<configBase>/<package>.manifest.json` recording the installed version and
  per-file sha256 hashes. `.version` marker files are non-conformant: their
  drift forces unconditional reinstalls on every start.
- **A2 Zero-write no-op.** When the manifest version matches the running
  package version and all hashes match, a start performs zero writes — no
  file copies, no config rewrites, no permission edits.
- **A3 Consumer edits survive.** Files the consumer modified (hash mismatch
  against the manifest) are skipped with a warning; overwriting them happens
  only through the CLI with explicit `--force`. A whole-directory copy that
  silently clobbers consumer edits is non-conformant.
- **A4 Version drift is scoped.** On drift, only the affected scope is
  updated and its manifest rewritten.

## B. Config safety

- **B1 No `{}`-on-parse-error rewrite.** A config file that fails to parse
  is preserved byte-for-byte and installation aborts (CLI) or warns and
  skips (load hook). Any code path that catches a parse error, returns an
  empty object, and later writes it back is non-conformant — it wipes
  unrelated config keys.
- **B2 Semantic plugin dedup, canonical form.** `name`, `name@latest`, and
  `name@x.y.z` are treated as the same package when deduplicating; new
  entries are written canonically as `name@latest`. Exact-string
  `includes()` dedup is non-conformant.
- **B3 Load hook never edits config registrations.** The load-time path
  never modifies `plugin` arrays and never writes permission or MCP
  configuration — those are CLI operations.

## C. Scope discipline

- **C1 Read-only, config-based scope detection.** Registration scope is
  determined by inspecting the global config, the repo's
  `.opencode/opencode.json`, and a repo-root `opencode.json`, using
  semantic `@latest`-aware name matching. Detection by launch directory
  (keying off the plugin `directory` input) is non-conformant — opencode
  always passes the consumer repo, which caused the historical cross-scope
  leak.
- **C2 No cross-scope writes.** Global context writes only under the global
  config directory; repo-local writes only under that repo's `.opencode/`.
  A globally-registered plugin that installs into every visited repo is the
  canonical violation.
- **C3 Root config is sacred at load.** No migration, merge, or deletion of
  a repo-root `opencode.json` from the load path; migration is CLI-only
  behind explicit consent.

## D. Structure and distribution

- **D1 Copy transparency.** Skills, commands, and agents are copied into
  the consumer's `.opencode/` (editable files), not loaded via config path
  tricks; custom plugins and tools remain TypeScript inside the package.
- **D2 CLI surface.** `install`, `uninstall`, `status` exist; `status`
  reports the manifest version (not a marker); overwrite and migration
  consent flags exist on the CLI.
- **D3 Regression contract tests.** The package's test suite covers: fresh
  repo (correct scope ensured, other scope untouched), root config never
  touched, unparseable config preserved, up-to-date no-op, drift update,
  both-scopes registration without leakage.
- **D4 One-shot advisory.** Any "not installed, run bunx … install" notice
  fires at most once per session and is suppressed when any scope holds an
  install.
- **D5 Frontmatter hygiene.** Frontmatter values in every shipped markdown
  file (agent definitions, `SKILL.md`, command files) contain no colons:
  a value that needs a colon (URLs, `provider/model-id`, sentences with
  colons) is rewritten or the value is enclosed in double quotes. Where
  possible, all frontmatter string values are double-quoted. Unquoted
  values containing `:` are non-conformant — YAML parses them as mappings
  or fails validation.

## Verdict scale

- **Conformant** — every item evidenced.
- **Partially conformant** — violations are latent (dead code, fallback
  paths not yet exercised); list item IDs with evidence.
- **Non-conformant** — any A1–A4, B1, C1–C3 violation on a live code path;
  these are the historically destructive patterns.
