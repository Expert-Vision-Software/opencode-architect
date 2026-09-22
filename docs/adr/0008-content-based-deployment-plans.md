# Content-based deployment plans

A package's install mechanism is decided by what the package ships, not
chosen per scope. Skills and commands are the only copy-deployable
extensions: an assets-only package copy-installs by default (`--mode plugin`
opts into always-fresh), while any package shipping agents, tools, hooks, or
other plugin integrations is code-backed and must be registered in the
target config file's `plugin` array. The CLI adds that entry surgically —
a text splice into the array with every other byte untouched, zero writes
when a semantically matching entry already exists — reading
`opencode.json`/`opencode.jsonc` at either base plus global `config.json`,
and creating a repo-root `opencode.jsonc` when no config exists. The
manifest generalizes to record mode, registration, and payload, so status,
uninstall, migration, and "what version is installed" have one source of
truth. Supersedes ADR-0004: its mutual exclusivity was motivated by copied
agents shadowing plugin-registered agents, and agents are no longer
copy-deployed — markdown remains the authoring format for agent
definitions, but deployment is plugin registration.

## Considered Options

- Content-based binary plan (chosen): copy transparency where files are
  meant to be edited, package registration where they are not; mirrors the
  `npx skills add` experience for assets-only packages
- Hybrid install (copy assets plus plugin entry) for mixed packages:
  rejected — two sources of truth for one package; a mixed package is
  code-backed, and its skills ship through load-time installation instead
- User-chosen mode for every package: rejected for code-backed packages —
  copying cannot express tools or hooks, so the choice would be illusory
- Per-scope mutual exclusivity (ADR-0004): superseded — it priced the whole
  install model around agent shadowing, which disappears when agents stop
  being copied

## Consequences

- `opencode-architect` itself becomes plugin-only: its CLI install is a
  registration manager, and agents, references, and templates resolve from
  the package at load
- Editing a consumer's config file is now part of install, making the
  surgical writer and the zero-write no-op load-bearing invariants rather
  than polish
- Every install writes a manifest, including plugin installs, giving
  `status` and `uninstall` a single authority for version, mode, and
  registration
- Existing copy installs migrate automatically: the manifest lists exactly
  the CLI-managed payload to remove before switching modes
- The copy default for assets-only packages keeps consumer config files
  untouched unless the package is code-backed or the consumer opts in
