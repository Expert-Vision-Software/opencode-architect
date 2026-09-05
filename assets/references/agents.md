# OpenCode agents — fundamentals

Agents are markdown-defined AI assistants. Locations (plural directory names):

- Project: `.opencode/agents/`
- Global: `~/.config/opencode/agents/`

The filename becomes the agent name (`review.md` → `review` agent). The markdown body is the system prompt.

## Types

- `primary` — main assistant the user interacts with (Tab to cycle).
- `subagent` — invoked by primary agents via the Task tool or by `@` mention.
- `mode` defaults to `all` if unspecified; set it explicitly.

## Frontmatter fields

| Field | Required | Notes |
| --- | --- | --- |
| `description` | yes | What the agent does and when to use it. Drives subagent selection. |
| `mode` | no | `primary`, `subagent`, or `all` (default `all`). |
| `model` | no | `provider/model-id` (e.g. `anthropic/claude-sonnet-4-5`). Unset: primary uses the configured global model; subagents inherit the invoking agent's model. |
| `temperature` | no | 0.0–1.0. Low (0.0–0.2) focused/deterministic; high (0.6+) creative. Model-specific defaults apply if unset. |
| `steps` | no | Max agentic iterations before forced text-only summary. `maxSteps` is deprecated. |
| `tools` | no | **Deprecated** boolean map (`write: false`, `bash: false`, `mymcp_*: false`). Prefer `permission`. |
| `permission` | no | Allow/ask/deny control, per key or per glob pattern (see below). |
| `hidden` | no | `true` hides a `subagent` from the `@` menu; still invokable via Task tool. |
| `disable` | no | `true` disables the agent. |
| `color` | no | Hex (e.g. `#ff6b6b`) or theme color (`primary`, `accent`, ...). |
| `top_p` | no | Alternative randomness control, 0.0–1.0. |
| other keys | no | Passed through to the provider as model options (e.g. `reasoningEffort`). |

## Permissions

Values: `"allow"`, `"ask"`, `"deny"`. Either shorthand or an object of glob/pattern → action.

Keys: `read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`, `webfetch`, `websearch`, `external_directory`, `todowrite`, `skill`, `lsp`, `question`, `doom_loop`.

- `edit` gates all file modifications: `write`, `edit`, `apply_patch`.
- `todowrite` gates `todowrite` and `todoread`.
- Shorthand-only keys: `webfetch`, `websearch`, `external_directory`, `question`, `doom_loop`, `lsp` (also accepts patterns — check schema when in doubt).

Bash command scoping (last matching rule wins; put `*` first, specific rules after):

```yaml
permission:
  bash:
    "*": ask
    "git status *": allow
    "git push": ask
  webfetch: deny
```

Task (subagent) scoping with globs — denied subagents are removed from the Task tool description:

```yaml
permission:
  task:
    "*": deny
    "orchestrator-*": allow
    "code-reviewer": ask
```

Users can always invoke any subagent directly via `@` regardless of task permissions.

## JSON alternative

Agents can also be configured under the `agent` key in `opencode.json` with the same options plus `prompt` (inline string or `{file:./path}` relative to the config file). Markdown files are preferred for readability.
