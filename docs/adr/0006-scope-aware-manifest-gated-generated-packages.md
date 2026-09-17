# Scope-aware, manifest-gated installation in generated packages

Templates shipped by this repo (`installer`, `plugin-local`, `cli`, plus the
new `plugin-name`, `manifest`, and `registration` templates) produce packages
whose install path is scope-aware and manifest-gated. The load-time hook
performs read-only registration-scope detection — checking the global
opencode config, the repo's `.opencode/opencode.json`, and a repo-root
`opencode.json` with semantic, `@latest`-aware plugin-name matching — then
ensures assets only for the scopes where the plugin is actually registered.
Idempotency comes from a manifest (`<configBase>/<package>.manifest.json`)
recording the installed version and per-file sha256 hashes, shared by the
CLI and the load hook: matching version and hashes is a zero-write no-op,
version drift updates only that scope, and consumer-modified files are
skipped with a warning unless `--force` (CLI-only).

## Considered Options

- Scope detection by launch directory (rejected): opencode always passes the
  consumer repo as `directory`, so launch-dir checks cannot distinguish
  scopes and caused the cross-scope leak fixed in `opencode-auto-qcgates`
  v1.5.0 — detection must inspect the config files themselves
- Version-marker files (`.version`) for idempotency (rejected): markers
  drift from content, forcing unconditional re-installs on every start; the
  manifest's per-file hashes make "up to date" a verifiable fact
- Rewriting config from `{}` on parse errors (rejected): a failed parse must
  abort with a warning, preserving the file byte-for-byte; synthesizing an
  empty config and writing it back wipes unrelated keys
- Exact-string plugin dedup (rejected): `name`, `name@latest`, and
  `name@x.y.z` refer to the same package; entries are matched semantically
  and written canonically as `name@latest`
- Auto root-config migration at install/load (rejected): migrating or
  deleting a repo-root `opencode.json` is CLI-only and requires explicit
  consent; the load hook never edits `plugin` arrays or root configs

## Consequences

- Skill-shipping packages generated from these templates reinstall only on
  real drift, never leak writes across scopes, and never destroy consumer
  config or modifications
- Consumers who hand-edit installed skill files keep their edits; upgrades
  report skipped files and `bunx <pkg> install --force` takes ownership
- Packages that ship only agents (in-memory injectable) do not need the
  load-time hook at all; these templates apply to skill/command assets that
  must exist on disk
