# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
