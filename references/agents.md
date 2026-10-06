# OpenCode agents — fundamentals

Agents are markdown-defined AI assistants. Discovery scans config roots for
`agent/` and `agents/` directories (`**/*.md`), plus `mode/` and `modes/`
files (mode files are primary agents). Project: `.opencode/agents/` —
global: `~/.config/opencode/agents/`. The filename becomes the agent name
(`review.md` → `review` agent); the markdown body is the system prompt.
Facts per `docs/reference/opencode-v2-facts.md` §3 (runtime record), §5
(config-agent fields), §6 (v1→v2 frontmatter mapping).

## Types

- `primary` — main assistant the user interacts with (Tab to cycle).
- `subagent` — invoked by primary agents via the Task tool or by `@` mention.
- `all` — both: usable as primary and invokable as subagent (the default mode).

## Frontmatter fields

Every frontmatter property value is enclosed in double quotation marks —
`description: "..."`, `mode: "subagent"` — never bare values; the only
exception is a value the schema requires as a native boolean or number
(checklist D6).

v1 fields are mapped, not dropped: `prompt` → `system` (the markdown body),
`temperature`/`top_p`/provider extras → `request` (passthrough into request
options/body), `tools` boolean map → `permissions` rules, `maxSteps` →
`steps`, `disable` → `disabled`. Facts §6.

| Field | Required | Notes |
| --- | --- | --- |
| `description` | no | Optional in v2 — but keep writing it: it drives subagent selection. |
| `mode` | no | `"primary"`, `"subagent"`, or `"all"` (default `"all"`). |
| `model` | no | A selection object: `{ "providerID": "anthropic", "model": "claude-sonnet-4-5" }` (optional `"variant"`). |
| `request` | no | Provider request options — sampling controls like temperature live here, passing through into the request body (facts §6), not as top-level fields. |
| `steps` | no | Max agentic iterations before forced text-only summary. (`maxSteps` is deprecated.) |
| `permissions` | no | Ordered ruleset array (see below) — replaces v1 `permission`/`tools`. |
| `hidden` | no | `true` hides a `"subagent"` from the `@` menu; still invokable via Task tool. |
| `disabled` | no | `true` disables the agent. |
| `color` | no | Hex only (e.g. `"#ff6b6b"`) — v2 accepts no theme color names. |
| `system` | no | Inline system prompt (JSON config; in markdown the body is the system prompt). |

## Permissions

v2 permissions are an **ordered array** of `{ action, resource, effect }`
rules. The last matching rule wins; wildcards are allowed in both action and
resource. Actions include the tool names (`read`, `edit`, `shell`,
`subagent`, `glob`, `grep`, `webfetch`, `websearch`, `question`, `skill`)
plus `*`, `external_directory`, and `provider.use` — the vocabulary is an
open string. `edit` gates all file modification (`write`, `edit`, `patch`).
Facts §4.

```yaml
permissions:
  - { action: "*", resource: "*", effect: "allow" }
  - { action: "shell", resource: "*", effect: "ask" }
  - { action: "shell", resource: "git status*", effect: "allow" }
  - { action: "shell", resource: "git push", effect: "ask" }
```

Subagent (Task) scoping with resource globs:

```yaml
permissions:
  - { action: "subagent", resource: "*", effect: "deny" }
  - { action: "subagent", resource: "orchestrator-*", effect: "allow" }
  - { action: "subagent", resource: "code-reviewer", effect: "ask" }
```

Built-in agent defaults allow everything except: `external_directory`
(asks, with batch approval and glob resources) and `read` on `.env` files.
Facts §3–4.

## JSON alternative

Agents can also be configured under the `agents` key in `opencode.json` —
same fields, with the system prompt in `system` (inline string or file
reference). Markdown files are preferred for readability. Facts §5.
