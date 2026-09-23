# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Conformance checklist items for the content-based deployment plan (ADR-0008): surgical config writes (B5), zero-write registration no-op (B6), content declaration present and consistent (E1), and binary mode enforcement (E2); E1–E2 and B5–B6 join the hard non-conformance set and the auditor's conformance review covers section E
- Plugins and config references document the allowed config patterns (including global `config.json`), the repo-root `opencode.jsonc` create-default, and the surgical-writer rule

### Changed

- **Breaking:** `install` is now a registration manager (plugin install is the only mode for this code-backed package, per [ADR-0008](docs/adr/0008-content-based-deployment-plans.md), superseding ADR-0004): the CLI ensures the `plugin` entry in the target scope's config file via the surgical editor — comments and formatting preserved, unparseable configs abort untouched — and writes a generalized manifest (version, mode, plugin entry, target config file) at the scope base. A matching manifest with the entry present is a zero-write no-op. `--mode copy` is refused with an explanatory error; `--force` now re-registers and rewrites the manifest instead of removing the entry
- Legacy copy installs migrate automatically on install: the old manifest's file list is removed exactly, with a printed notice, before the plugin entry is added
- `uninstall` surgically removes the plugin entry (config formatting preserved) plus the manifest and any residual copy payload — manifest-gated, or a known-filenames sweep of `agents/` and `opencode-architect/` when no manifest exists; `status` reports mode, version, and the config file holding the registration
- Generalized manifest schema covers copy mode too, with a single `content-hash` property (folder-hash) for copy-installed payloads
- Nothing changes at runtime: the plugin already registers the agents from the package and resolves reference paths at load

## [0.7.1] - 2026-09-21

### Fixed

- `permission-registrar.ts` missing from the published tarball (`package.json` `files`): `index.ts` imports it at load, so npm-installed copies of 0.7.0 failed at startup

### Added

- Tarball contents regression test: `npm pack --dry-run` output must cover every `files` whitelist entry and nothing else — the same guard the conformance checklist's D4 mandates for published packages
- `prepublishOnly` script running typecheck and tests before `npm publish`

### Changed

- Conformance-drift instruction gap closure: checklist amendments (C1 directory-identity and unparseable-candidate clauses, B4 advisory contract, new A5 loud asset absence, D8 consumer snippet `plugin`-key validity), `.jsonc`-lenient registration/installer templates with loud asset-absence handling, auditor execution and criteria-version requirements, `plugin` (singular) key across packager/publisher consumer snippets

## [0.7.0] - 2026-09-20

### Fixed

- Repeated `external_directory` permission prompts when agents read bundled references in plugin install mode: the load-time `config` hook now registers an in-memory allow scoped to the package's own `assets/*` directory, preserving existing rules and respecting an explicit global deny (#11)

## [0.6.0] - 2026-09-20

### Added

- Startup non-interference rules, recorded in [ADR-0007](docs/adr/0007-startup-non-interference-never-throw-from-hooks.md): load-time hooks never throw — failures degrade to a warning plus one advisory so OpenCode always launches; hard errors stay CLI-only
- npm plugin loading mechanics section in the plugins reference: cache-dir resolution, `import.meta.dirname` semantics, error-handling and timeout behavior, config-format and precedence rules (verified against the OpenCode source)
- Conformance checklist items: **B4** hooks-never-throw, **D4** cache-rot advisory naming the exact cache directory and `npm pack --dry-run` tarball verification

### Changed

- Plugin-engineer agent: startup non-interference section — wrap load-time installation in try/catch, detect registration in both `opencode.json` and `opencode.jsonc`, treat absent assets as a partial npm cache artifact with a removal advisory
- `plugin-local.template.txt`: config-hook installation wrapped in try/catch (load-bearing); load-bearing note covers format-tolerant scope detection
- Conformance checklist: **C1** requires both config extensions, **D3** adds `.jsonc`-registration and hook-degradation regression tests, verdict scale includes B4
- Glossary: *Startup non-interference*, *Partial cache artifact*

## [0.5.0] - 2026-09-17

### Added

- Scope-aware, manifest-gated install pattern for generated packages, recorded in [ADR-0006](docs/adr/0006-scope-aware-manifest-gated-generated-packages.md): read-only registration-scope detection, per-scope install manifests with per-file sha256 hashes, zero-write no-ops on matching manifests
- New templates: `plugin-name.template.txt` (semantic `@latest` plugin-name normalizer), `manifest.template.txt` (install manifest), `registration.template.txt` (read-only scope detector)
- Package conformance review: [conformance checklist](assets/references/conformance-checklist.md) rubric (install mechanics, config safety, scope discipline, frontmatter hygiene), a conformance review mode in `opencode-extension-auditor`, and orchestrator routing for "is this package aligned?" prompts
- Shared `live-knowledge-fallback.md` reference replacing per-agent duplicated fallback prose
- Publisher post-publish verification checklist and npm troubleshooting (403/404 auth, E422 provenance casing, 409 version-bump recovery)
- Publisher README badge row step for generated packages: npm version, Bun runtime, TypeScript, license, platforms, OpenCode plugin, and DeepWiki badges
- Packager discovery-study step for shaping new packages from example repos, with bundled templates declared the structural source of truth
- Frontmatter hygiene rule: no colons in frontmatter values; double-quote string values where possible

### Changed

- `installer.template.txt` rewritten: manifest-gated idempotency replaces `.version` markers; unparseable configs abort with a warning instead of being rewritten from `{}`; plugin entries dedupe semantically and are written canonically as `name@latest`; consumer-modified files are skipped unless the CLI passes `--force`; root-config migration is consent-gated and CLI-only
- `plugin-local.template.txt` rewritten: loads via read-only scope detection and ensures only registered scopes; never edits `plugin` arrays or permission/MCP config at load
- `cli.template.txt` updated: `--force` forwarded to install, consent-gated `migrate` subcommand, manifest-aware `status`; fixed `src/`-relative import paths

## [0.4.0] - 2026-09-06

### Added

- `opencode-architect` CLI, runnable with `bunx` or `npx`, with a manifest-based copy install: `install`, `status`, `uninstall`, `--scope local|global`, and `--force` (#7, [ADR-0004](docs/adr/0004-cli-copy-install-with-mutually-exclusive-modes.md))
- Copy install writes agents, references, and templates into the scope base plus an `opencode-architect.json` manifest that tracks versions and file hashes for safe upgrades and skipped-file protection (#7)
- `.github/FUNDING.yml` (#3)

### Changed

- Writing-for-agents pass across the bundled agent definitions (#4)
- Writing-for-agents pass across bundled references and templates; repaired the Example 6 decision table and normalized frontmatter style (#5)
- Writing-for-agents pass on repo instruction files: AGENTS.md, CONTEXT.md, ADRs, and bundled skills (#6)
- Deployed packager and publisher agents now resolve bundled template references correctly, recorded in [ADR-0005](docs/adr/0005-bundled-templates-resolved-like-references.md) (#10)
- README overhaul for SEO and marketing: badges, keyword-rich quick start covering every install path, ten-agent what-you-get table; npm description and keywords aligned with README claims (#8)

### Removed

- `assets/templates/package-analysis.template.md` starter template (#10)

## [0.3.0] - 2026-09-05

### Changed

- Migrated repository to `Expert-Vision-Software/opencode-architect`
- Updated package metadata: repository, homepage, bugs URLs, npm `publishConfig`
- Added GitHub Actions CI on `main` and automated npm publishing on `v*` tags

## [0.2.4] - 2026-04-22

### Changed

- Prior release under `diegohb/opencode-architect`; see git history for details.
