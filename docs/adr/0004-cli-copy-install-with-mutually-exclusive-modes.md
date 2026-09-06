# CLI copy install with mutually-exclusive modes

`bunx opencode-architect` installs the suite by copying — the ten agent
markdown files into the scope base's `agents/` and the bundled references
into `opencode-architect/references/` — and rewrites the backticked relative
reference paths in agent prompts once, at install time, into absolute paths
inside the installed references directory. Copy install and plugin install
(the `opencode.json` plugin entry) are mutually exclusive per scope:
`install` refuses to run while the plugin entry is present, and `--force`
removes the entry and switches modes. A manifest at the scope base records
the version, installed files, and their content hashes, so same-version
re-runs are no-ops, upgrades skip locally-modified files unless `--force`,
and uninstall removes exactly what install wrote.

## Considered Options

- Mutually-exclusive modes (chosen): no silent shadowing — each mode serves
  a different consumer (always-fresh plugin vs editable copy)
- Complement (copy plus plugin entry): OpenCode loads `.opencode/agents/`
  after plugin-registered agents, so copied files silently shadow the
  plugin's agents — undetected version skew
- Install-time reference resolution (chosen, for path handling): copied
  agents are plain files
  OpenCode loads verbatim, so the plugin's load-time resolution never runs
  for them and relative paths would be unresolvable against a consumer's cwd
- Rewrite to package-cache paths: transparency-hostile; the bunx/npm cache
  is ephemeral and outside the consumer's control
- Leave paths relative: broken for every copied agent

## Consequences

- Installed agents diverge textually from repo agents (absolute paths);
  the divergence is expected and marks the file as install-managed
- Local edits to installed agents survive upgrades (manifest hashes);
  edits to installed references take effect immediately
- The CLI wholly owns `opencode-architect/` under the scope base but never
  touches consumers' own files in the shared `agents/` directory
