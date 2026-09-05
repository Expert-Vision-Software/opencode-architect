# OpenCode config — fundamentals

OpenCode is configured with `opencode.json` (or `.jsonc`). Schema: `https://opencode.ai/config.json`. TUI settings live in a separate `tui.json` (`https://opencode.ai/tui.json`).

## Locations and precedence

Configs are **merged, not replaced**; later sources override earlier ones only for conflicting keys:

1. Remote config (`.well-known/opencode`, organizational defaults)
2. Global config (`~/.config/opencode/opencode.json`)
3. Custom config (`OPENCODE_CONFIG` env var)
4. Project config (`opencode.json` at project root, searched up to the git root)
5. `.opencode/` directories (agents, commands, plugins, skills, tools)
6. Inline config (`OPENCODE_CONFIG_CONTENT` env var)
7. Managed files (`/etc/opencode/`, `%ProgramData%\opencode`, macOS app support) and macOS MDM preferences — highest, not user-overridable

So: defaults/remote < global < project; managed settings override everything.

## Key schema options

| Key | Purpose |
| --- | --- |
| `model` | Default model, `provider/model-id`. |
| `small_model` | Cheap model for lightweight tasks (titles, summaries). |
| `provider` | Provider config; `options` supports `timeout`, `headerTimeout`, `chunkTimeout`. |
| `enabled_providers` / `disabled_providers` | Provider allowlist/blocklist (`disabled_providers` wins). |
| `agent` | Inline agent definitions; `default_agent` picks the default primary agent. |
| `command` | Inline command definitions (`template`, `description`, `agent`, `model`). |
| `mode` | Inline mode/agent-group definitions. |
| `mcp` | MCP server config (see mcp-servers reference). |
| `plugin` | npm plugin packages to load. |
| `tools` | Global tool enable/disable map with globs (`"write": false`). |
| `permission` | Global `allow`/`ask`/`deny` map (see agents reference for keys). |
| `instructions` | Extra instruction files/globs (e.g. `["CONTRIBUTING.md", "docs/rules/*.md"]`). |
| `lsp` | LSP servers (`true` for defaults, or object with per-server overrides). |
| `formatter` | Formatters (`true` for defaults, or object; custom: `command`, `extensions`, `environment`). |
| `keybinds` | TUI shortcuts (in `tui.json`; merged with defaults). |
| `share` | `"manual"` (default) / `"auto"` / `"disabled"`. |
| `autoupdate` | `true` / `false` / `"notify"`. |
| `snapshot` | `false` disables undo snapshots. |
| `compaction` | `{ auto, prune, reserved }` context compaction behavior. |
| `watcher` | `{ ignore: [globs] }` file watcher exclusions. |
| `server` | `port`, `hostname`, `mdns`, `cors` for `opencode serve`/`web`. |
| `shell` | Shell for interactive terminal and tool calls (e.g. `pwsh`). |
| `subagent_depth` | Subagent nesting depth (default 1; 0 disables subagents). |
| `experimental` | Options under active development (e.g. `policies`). |

## Directory conventions

`.opencode/` and `~/.config/opencode/` use **plural** subdirectory names: `agents/`, `commands/`, `plugins/`, `skills/`, `tools/`, `themes/` (singular accepted for backwards compatibility). Configs are safe to check into git; `prompt` paths in agent config resolve relative to the config file.
