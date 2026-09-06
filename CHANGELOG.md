# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-09-06

### Added

- `opencode-architect` CLI, runnable with `bunx` or `npx`, with a manifest-based copy install: `install`, `status`, `uninstall`, `--scope project|global`, and `--force` (#7, [ADR-0004](docs/adr/0004-cli-copy-install-with-mutually-exclusive-modes.md))
- Copy install writes agents, references, and templates into the scope base plus an `opencode-architect.json` manifest that tracks versions and file hashes for safe upgrades and skipped-file protection (#7)
- `.github/FUNDING.yml` (#3)

### Changed

- Writing-for-agents pass across the bundled agent definitions (#4)
- Writing-for-agents pass across bundled references and templates; repaired the Example 6 decision table and normalized frontmatter style (#5)
- Writing-for-agents pass on repo instruction files: AGENTS.md, CONTEXT.md, ADRs, and bundled skills (#6)
- Deployed packager and publisher agents now resolve bundled template references correctly (#10)
- README overhaul for SEO and marketing: badges, keyword-rich quick start covering every install path, ten-agent what-you-get table; npm description and keywords aligned with README claims (#8)

## [0.3.0] - 2026-09-05

### Changed

- Migrated repository to `Expert-Vision-Software/opencode-architect`
- Updated package metadata: repository, homepage, bugs URLs, npm `publishConfig`
- Added GitHub Actions CI on `main` and automated npm publishing on `v*` tags

## [0.2.4] - 2026-04-22

### Changed

- Prior release under `diegohb/opencode-architect`; see git history for details.
