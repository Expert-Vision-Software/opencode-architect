# Package conformance checklist

Canonical review criteria for assessing whether an existing plugin package
conforms to this suite's design (ADR 0006: scope-aware, manifest-gated
installation). Review a built package — a repo with `plugin.ts`, install
logic, a bundled asset directory (`assets/` or repo-root `skills/`), and
`package.json` — against every item. Cite
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
- **A5 Loud asset absence.** When a bundled asset source directory is
  missing or empty (partial cache artifact), the install fails loudly: the
  error names the missing path, the package name and version, the cache
  directory to clear, and the install command. A manifest is never written
  when zero files were written, and `status`/up-to-date checks never report
  a manifest-only or zero-file scope as installed. A skipped asset that
  leaves the scope looking installed is non-conformant. (Hard error on the
  CLI; the B4 catch turns it into a warning at load.)

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
- **B4 Hooks never throw (startup non-interference).** The entire load-time
  installation block is wrapped so any failure becomes a warning plus at
  most one advisory (naming the exact remediation command or cache path)
  and OpenCode still launches; in-memory config work still applies. A hook
  that can reject into config assembly is non-conformant — such a rejection
  can stall startup with no UI escape (ADR 0007). The wrap covers the
  **entire hook body**, not just the install block. The advisory names both
  the remediation command (`bunx <package> install --scope global`) and the
  package-qualified cache directory
  (`~/.cache/opencode/packages/<package>@<version>`, or a literal
  `<version>` placeholder when metadata is unreadable); the advisory builder
  sits in its own try/catch with a static fallback, and each emitter (log,
  toast) swallows independently. The failure advisory and the D5
  not-installed advisory are distinct advisories with **separate**
  once-guards — sharing one flag lets either suppress the other. The hook
  never deletes the cache (deletion races OpenCode's in-flight installs);
  it instructs only.

## C. Scope discipline

- **C1 Read-only, config-based scope detection.** Registration scope is
  determined by inspecting the global config and the repo's configs —
  `.opencode/opencode.json(c)` and a repo-root `opencode.json(c)`, both
  extensions — using semantic `@latest`-aware name matching. Detection by
  launch directory (keying off the plugin `directory` input) is
  non-conformant — opencode always passes the consumer repo, which caused
  the historical cross-scope leak. Detection that reads only `opencode.json`
  and ignores `opencode.jsonc` is also non-conformant (ADR 0007).
  Detection that performs **any** directory-identity comparison — the
  plugin dir against the launch `directory`, `import.meta.dirname`,
  `process.cwd()`, or a realpath of any of these — is non-conformant,
  including "self-checkout" conveniences. A maintainer's own checkout is
  made to work by registering the package in that repo's config
  (`skills.paths` and/or a `plugin` entry), never by a directory check.
  Detection that silently treats an unparseable candidate as unregistered
  is also non-conformant: every candidate `opencode.json(c)` that fails to
  parse is preserved byte-for-byte and warned about, before any
  short-circuit on a successful match.
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
  both-scopes registration without leakage, registration via
  `opencode.jsonc` detected (including a `.jsonc` with a comment between a
  trailing comma and its closer), a missing bundled asset directory making
  install throw, and repeated failing hook invocations emitting exactly one
  failure advisory while the D5 advisory still fires independently in a
  later session.
- **D4 Cache-rot advisory.** When bundled assets are unexpectedly absent at
  load (partial npm cache artifact), the advisory names the exact cache
  directory to remove; the README/publish flow verifies tarball contents
  (`npm pack --dry-run`) so published packages ship their assets. The
  advisory must be derived from package metadata with an infallible
  fallback, so it still carries the package-qualified cache path when
  metadata is unreadable.
- **D5 One-shot advisory.** Any "not installed, run bunx … install" notice
  fires at most once per session and is suppressed when any scope holds an
  install.
- **D6 Frontmatter hygiene.** Frontmatter values in every shipped markdown
  file (agent definitions, `SKILL.md`, command files) contain no colons:
  a value that needs a colon (URLs, `provider/model-id`, sentences with
  colons) is rewritten or the value is enclosed in double quotes. Where
  possible, all frontmatter string values are double-quoted. Unquoted
  values containing `:` are non-conformant — YAML parses them as mappings
  or fails validation.
- **D7 README badge row.** The package README carries, directly below the
  first heading, the badge row: npm version, Bun runtime, license,
  platforms (URL-encoded, matching the repo's actual platforms), the fixed
  OpenCode plugin badge, and DeepWiki when indexed. Badge URLs use the
  exact package name and repo casing (`My-Org/pkg` ≠ `my-org/pkg`). A
  missing badge row, extra runtime badges, or mismatched casing is
   non-conformant.

- **D8 Consumer snippet key validity.** Every `opencode.json` snippet the
  package ships (README, AGENTS.md, CONTRIBUTING, CLI help) uses the
  top-level key `plugin` — never `plugins` — with entries canonicalized as
  `name@latest` or a `file:///` URL. Verify emitted keys against
  `https://opencode.ai/config.json` (the `Config` definition sets
  `additionalProperties: false`, so an invalid key is rejected at load). A
  shipped snippet using an invalid key is non-conformant.

## Verdict scale

- **Conformant** — every item evidenced.
- **Partially conformant** — violations are latent (dead code, fallback
  paths not yet exercised); list item IDs with evidence.
- **Non-conformant** — any A1–A4, B1, B4, C1–C3 violation on a live code path;
  these are the historically destructive patterns.
