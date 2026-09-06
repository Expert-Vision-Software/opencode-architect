# Copy transparency for markdown extensions

Skills, commands, and agents are distributed by copying them into the
consumer's `.opencode/` directory, not by registering their paths in the
package plugin. Commands and agents have no path-registration mechanism in
OpenCode, and for skills we chose copying over `config.skills.paths` so
consumers can see, read, and modify the extension content locally.
The cost is duplication between package and consumer, reconciled by a
version marker so the plugin re-copies only when the package version changes.

## Considered Options

- Copying (chosen): transparent, editable, works for all three kinds
  (skills, commands, agents)
- Path registration: single source of truth, but black-box and unavailable
  for commands and agents
- Hybrid: rejected for inconsistency
