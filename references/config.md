# OpenCode config — fundamentals

OpenCode v2 is configured with `opencode.json` or `opencode.jsonc` — legacy
`config.json` is no longer read anywhere. Schema key:
`"$schema": "https://opencode.ai/config.json"` (the URL the suite's own
installer writes and the verification harness accepts; whether a distinct
v2 schema URL exists is pending verification — facts §5). Facts per
`docs/reference/opencode-v2-facts.md` §5 (schema, discovery), §4
(permissions), §6 (v1→v2 mapping), §13 row 3.

## Locations and precedence

Config discovery reads only `opencode.json`/`opencode.jsonc`, from: the
global config dir, walked project directories, plus `.opencode/`, `.claude/`,
and `.agents/` directories. `OPENCODE_CONFIG_DIR` overrides the global dir;
`OPENCODE_CONFIG_CONTENT` injects a virtual config with the highest
precedence. Configs are **merged, not replaced**, lowest → highest:
well-known remote → global → explicit → direct → project →
`OPENCODE_CONFIG_CONTENT`. Facts §5.

Remote config still exists as `.well-known/opencode`, reshaped: a per-origin
manifest `{ auth?, config?, remote_config? }` under an integration id. There
is no managed `/etc/opencode` support in v2. Facts §5.

## Key schema options

| Key | Purpose |
| --- | --- |
| `$schema` | Schema URL. |
| `model` | Default model — an object: `{ "providerID": "...", "model": "...", "variant": "..." }`, not a `provider/model` string. |
| `default_agent` | Name of the default primary agent. |
| `permissions` | Ordered permission ruleset array (see below) — replaces v1 `permission`/`tools` maps. |
| `agents` | Inline agent definitions (`Record<string, agent info>`) — replaces v1 `agent` + `mode`. |
| `commands` | Inline command definitions — replaces v1 `command`. |
| `mcp` | MCP server config, name → server (see mcp-servers reference). |
| `plugins` | Plugin packages to register (see plugins reference) — replaces v1 `plugin`. |
| `skills` | Extra skill paths or URLs (array of strings) — absorbs v1 `skills {paths, urls}`. |
| `instructions` | Extra instruction files/globs. |
| `update` | `"disable"`, `"notify"`, or `"auto"` — absorbs v1 `autoupdate`. |
| `share` | `"manual"`, `"auto"`, or `"disabled"` — absorbs v1 `autoshare`. |
| `snapshots` | `false` disables undo snapshots — absorbs v1 `snapshot`. |
| `references` | Reference config — absorbs v1 `reference`. |
| `shell` | Shell for interactive terminal and tool calls (e.g. `pwsh`). |
| `formatter`, `lsp` | Formatters and LSP servers. |
| `media` | Media/attachment config — absorbs v1 `attachment`. |
| `tool_output`, `compaction`, `watcher`, `websearch`, `worktree`, `warming` | v2-native behavior objects. |
| `providers` | Provider config. |
| `experimental` | Options under active development. |
| `enterprise`, `username` | v2-native. |

Dropped v1 keys and their fate (facts §5, §6): `logLevel`, `server`,
`layout` — rejected as unsupported top-level keys; `subagent_depth` moved
under `experimental`; `small_model` became the model of the built-in `title`
agent (`agents.title.model`); `enabled_providers`/`disabled_providers`
became generated `experimental` permission rules on a `provider.use` action;
`keybinds`/`theme`/`tui` are deprecated (auto-migration is claimed by docs
only — pending verification, facts §14.8).

## Permissions (ruleset array)

`permissions` is an **ordered array** of `{ action, resource, effect }`
rules; the last matching rule wins; wildcards are allowed in both action and
resource:

```json
{
  "permissions": [
    { "action": "*", "resource": "*", "effect": "allow" },
    { "action": "edit", "resource": "*", "effect": "ask" },
    { "action": "shell", "resource": "git push*", "effect": "ask" },
    { "action": "external_directory", "resource": "/tmp/**", "effect": "ask" }
  ]
}
```

Effects: `"allow"`, `"ask"`, `"deny"`. The action vocabulary is an open
string — observed actions are the tool names (`read`, `edit`, `shell`,
`subagent`, `glob`, `grep`, `webfetch`, `websearch`, `question`, `skill`)
plus cross-cutting `*`, `external_directory`, and `provider.use`.
`edit` gates all file modification (`write`, `edit`, `patch`). Legacy v1
actions with no v2 tool (e.g. `list`, `todowrite`) are legal rules that
never match. Facts §4.

## Inline agents

`agents` entries take: `model` (Selection object), `request`, `system`,
`description`, `mode` (`"subagent"`, `"primary"`, `"all"`), `hidden`,
`color` (hex only), `steps`, `disabled`, `permissions`. `description` is
optional in v2 (it drives subagent selection — keep writing it). Facts §5, §6.

## Inline commands

`commands` entries take: `template`, `description`, `agent`, `model`
(Selection), `subagent`. `subtask` is a deprecated alias. Facts §5.

## Directory conventions

Config roots use these subdirectories (both spellings are discovered):
`agent(s)/`, `command(s)/`, `skill(s)/`, `plugin(s)/` — markdown files, and
`.ts`/`.js` plugin files, are picked up from every root. Facts §7, §12.
Configs are safe to check into git.
