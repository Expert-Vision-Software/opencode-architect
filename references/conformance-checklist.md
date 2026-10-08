# Package conformance checklist

Canonical review criteria for assessing whether an existing plugin package
conforms to this suite's design (ADR 0006: scope-aware, manifest-gated
installation; ADR-0012: v2-native only). Facts per
`docs/reference/opencode-v2-facts.md` — cited per item. Review a built
package — a repo with a default-only `index.ts`, an Effect-first plugin
definition in `src/plugin.ts`, install logic, bundled content directories at
the package root (`skills/`, `commands/`; the legacy `assets/` wrapper is
recognized but non-default), and `package.json` declaring
`exports["./server"]` — against every item. Cite file and line evidence per
item; an item with no evidence found is a finding.

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
- **A6 Cache hygiene (self-scoped).** Every install — including a zero-write
  no-op — prunes the package's own cache keys (`<package>`,
  `<package>@latest`, `<package>@<version>`) from OpenCode's npm plugin
  cache (`$XDG_CACHE_HOME/opencode/npm`, falling back to
  `~/.cache/opencode/npm` — each key holding every cached generation; facts
  §7), best-effort: per-copy removal failures warn
  and the install still succeeds. Other packages' cache keys and pinned
  `<package>@x.y.z` copies are never touched. The CLI exposes a self-only
  `clear-cache` subcommand that removes `<package>` and every
  `<package>@*` idempotently (nothing cached is a success) with the same
  warn-and-continue semantics; a `--package <name>` or `--all` mode on a
  generated package's CLI is non-conformant — broad cache deletion belongs
  to the suite's own CLI only. The load-time hook never deletes cache
  entries (deletion races OpenCode's in-flight installs, ADR-0007): when
  bundled assets are absent (partial cache artifact), its advisory
  instructs running `bunx <package> clear-cache` and reinstalling. A hook
  that deletes cache entries, or an advisory that only describes manual
  cache removal, is non-conformant.

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
  never modifies `plugins` arrays and never writes permission or MCP
  configuration — those are CLI operations. A legacy singular `plugin` entry
  is tolerated read-only: reported with an upgrade advisory, never rewritten
  (facts §13 row 10).
- **B4 Hooks never throw (startup non-interference).** The entire load-time
  installation block is wrapped so any failure becomes a warning plus at
  most one advisory (naming the exact remediation command or cache path)
  and OpenCode still launches; in-memory config work still applies. A hook
  that can reject into config assembly is non-conformant — such a rejection
  can stall startup with no UI escape (ADR 0007). The wrap covers the
  **entire hook body**, not just the install block. The advisory names both
  the remediation command (`bunx <package> install --scope global`) and the
  package-qualified npm cache key
  (`$XDG_CACHE_HOME/opencode/npm/<package>@<version>` — falling back to
  `~/.cache/opencode/npm/…` — or a literal
  `<version>` placeholder when metadata is unreadable); the advisory builder
  sits in its own try/catch with a static fallback, and each emitter (log,
  toast) swallows independently. The failure advisory and the D5
  not-installed advisory are distinct advisories with **separate**
  once-guards — sharing one flag lets either suppress the other. The hook
  never deletes the cache (deletion races OpenCode's in-flight installs);
  it instructs only.

- **B5 Surgical config writes.** Every registration write to a consumer
  config file is a text splice into the `plugins` array with every other
  byte untouched — indentation, comments, trailing commas, key order, and
  unrelated keys all preserved. A parse-then-reserialize of the whole file
  (which reformats or drops comments) is non-conformant. The splice never
  touches anything outside the array, and a file that cannot be spliced is
  reported, not rewritten.
- **B6 Zero-write registration no-op.** When a semantically matching entry
  (`name`, `name@latest`, `name@x.y.z`) already exists in a candidate
  config, registration for that config is a no-op: zero bytes written, even
  when the entry's spelling differs from the canonical form. Conversely, a
  plugin-mode up-to-date check requires the recorded entry to still be
  present — a version match alone is not enough when the entry was removed.

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
  (`skills.paths` and/or a `plugins` entry), never by a directory check.
  A global legacy `config.json` is a read-only candidate only — v2 never
  reads it, so an entry there is inert: warn and point the consumer at
  `opencode.json(c)`; never edit it (facts §5, §13 row 3).
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
- **D6 Frontmatter hygiene.** In every shipped markdown file (agent
  definitions, `SKILL.md`, command files) **every frontmatter property
  value is enclosed in double quotation marks** — bare values are
  non-conformant: `mode: subagent` fails, `mode: "subagent"` conforms.
  Quoting is mandatory, not best-effort, and applies to names,
  descriptions, enum values, and everything else. The only exception is a
  value the consuming schema requires as a native YAML boolean or number
  (e.g. `subagent: true`, `steps: 25`). A value that needs a colon
  (URLs, `provider/model-id`, sentences with colons) stays inside its
  double quotes; an unquoted value containing `:` is doubly
  non-conformant — YAML parses it as a mapping or fails validation.
- **D7 README badge row.** The package README carries, on **one single
  line** directly below the first heading, the badge row: npm version, Bun
  runtime, license, platforms (URL-encoded, matching the repo's actual
  platforms), the fixed OpenCode plugin badge, and DeepWiki when indexed.
  Badge URLs use the exact package name and repo casing (`My-Org/pkg` ≠
  `my-org/pkg`). A missing badge row, a multi-line row, extra runtime
  badges, hand-rolled variants, or mismatched casing is non-conformant.

- **D8 Consumer snippet key validity (inverted for v2).** Every
  `opencode.json` snippet the package ships (README, AGENTS.md, CONTRIBUTING,
  CLI help) uses the top-level key `plugins` — **never the legacy singular
  `plugin`** — with entries canonicalized as `name@latest` or a `file:///`
  URL. Verify emitted configs against the pinned `@opencode/schema`
  `Config.Info` (the verification harness validates every config the
  installer/editor produces — `harness:
  tests/fixture-config-schema.test.ts`; facts §5). A shipped snippet using
  the v1 singular key or any unsupported key is non-conformant. The only
  legitimate mention of the singular key is a read-only legacy advisory
  (B3, C1) — never a shipped snippet.

- **D9 Promoted-source retirement.** When a package is created from
  existing `.opencode/` extensions, the originals are removed only after
  (1) a live config reference to the package exists — a `plugins` entry or
  `skills.paths`, surgically written with user consent — and (2) the
  scope's payload is verified on disk (install manifest present, files
  match the packaged copies). Deletion is per-item with a printed list and
  explicit user consent — never the whole `.opencode/` directory, never
  unrelated extensions, and never with no reference in place (the
  extension would silently vanish from the next start). The end state
  leaves `.opencode/` holding only the config file plus hook-managed
  payload and manifests: the source `package.json`, lockfile,
  `node_modules/`, and every promoted original are gone.

## E. Deployment plan (ADR-0008)

- **E1 Content declaration present and consistent.** `package.json` carries
  a `"content"` field (`"assets"` or `"code"`), and it matches what the
  package actually ships: any package containing agents, tools, hooks, or
  other plugin integrations declares `"code"`; an assets-only package
  declares `"assets"`. A missing declaration, or one contradicting the
  payload (e.g. `"assets"` on a package shipping a `src/plugin.ts` hook) is
  non-conformant.
- **E2 Binary mode enforcement.** The deployment plan is binary and
  content-decided: assets-only packages copy-install by default (`--mode
  plugin` opts into registration); code-backed packages always register and
  `--mode copy` is a hard, explanatory error (`CopyModeUnsupportedError`),
  never a hybrid copy-plus-register. A per-scope mode choice, a mixed
  copy-and-register install, or a silent mode fallback is non-conformant.
- **E3 Entry module default-only (ADR-0010, v2 contract).** The package
  entry module (`index.ts`) exports nothing besides `default`, and `default`
  is the plugin definition — the v2 loader requires a default definition
  with an `id` and an `effect` or `setup`; anything else fails loading with
  "Plugin must export a default definition with an id and an effect or setup
  function" (facts §2). The v1 mechanism notes in ADR-0010 (factory
  invocation, `Plugin export is not a function`) are superseded. Internal
  consumers (CLI, tests) import the definition builder from its own module
  (`src/plugin.ts`), never from the entry.
- **E4 Root holds only the entry (ADR-0011).** `index.ts` is the only
  TypeScript file at the package root; every other module — the plugin
  definition (`src/plugin.ts`), installer, CLI, helpers — lives under
  `src/`. A root-level `plugin.ts` or any stray code file outside `src/` is
  non-conformant (a legacy root-level `plugin.ts` is recognized during
  merge and migration, but a package built or audited against this
  checklist must not ship one).

## F. V2 conformance (ADR-0012)

- **F1 Effect plugin definition.** The entry default-exports a plugin
  definition `{ id, effect }` built with `@opencode/plugin/effect`
  (`Plugin.define`) — the suite's house style — or, for trivial plugins,
  the Promise shape `{ id, setup }`. A stable, unique `id` is load-bearing
  (storage scoping, diagnostics; duplicate ids die activation). Hooks
  objects, anonymous functions, or any other default-export shape are
  non-conformant. Consumer guidance pins nothing: authoring deps resolve
  `latest`. Facts §1–2.
- **F2 Permissions ruleset array.** Every shipped agent definition and
  config snippet expresses permissions as the v2 **ordered ruleset array**
  (`[{ action, resource, effect }]`, last matching rule wins, wildcards
  allowed) — v1 `permission` keyed records and `tools` boolean maps are
  non-conformant. Observed action vocabulary per facts §4. Agent `color`
  values are hex only. Facts §4–6.
- **F3 JSON-Schema tool arguments.** Plugin-registered tools declare
  `input` as raw JSON Schema, an Effect `Schema.Codec`, or any
  Standard-Schema validator — the v1 `tool.schema` helper style is gone and
  its reappearance is non-conformant. Results use the v2
  `{ output?, content?, metadata? }` shape; failures `Tool.Error`. Facts §8.
- **F4 Entrypoint declared.** `package.json` declares
  `exports["./server"]`; nothing relies on the package-root-index fallback
  (runtime-dependent — dead on Bun 1.3.x, which disables the plugin at the
  entry stage). Facts §7, §13 row 9, §14.6;
  `harness: tests/v2-host.test.ts`.
- **F5 Root export optional.** The `exports` map is a closed allowlist:
  with no `"."` key, `import "<pkg>"` by bare name fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED` on Node and Bun (deep imports fail too
  unless the map adds `"./*"`); resolvers that honor `exports` ignore
  `module` and `main`, and `bin` entries bypass `exports` so the CLI keeps
  working without `"."`. The root export therefore stays **optional**:
  OpenCode v2 resolves server plugins only through `exports["./server"]`
  (F4; `resolvePackageEntrypoint`, `packages/opencode/src/plugin/shared.ts`
  in sst/opencode) and skill discovery is file-based only
  (`discoverNodeModuleSkills` in vercel-labs/skills — it never imports the
  entry or reads `exports`). When present, point `"."` at `./index.ts`.
  `harness: tests/v2-host.test.ts` ("does not use npm package exports dot
  for server entry").

## Verdict scale

- **Conformant** — every item evidenced.
- **Partially conformant** — violations are latent (dead code, fallback
  paths not yet exercised); list item IDs with evidence.
- **Non-conformant** — any A1–A4, B1, B4–B6, C1–C3, E1–E4, F1–F5 violation
  on a live code path; these are the historically destructive patterns.
