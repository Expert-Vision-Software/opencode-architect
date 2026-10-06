# OpenCode commands — fundamentals

Custom commands are prompt templates invoked as `/name` in the TUI. Discovery
scans config roots for `command/` and `commands/` directories — project:
`.opencode/commands/`, global: `~/.config/opencode/commands/`. The filename
becomes the command name (`test.md` → `/test`). Frontmatter decodes into
command config; the markdown body is the template. Facts per
`docs/reference/opencode-v2-facts.md` §5 (command fields), §12 (discovery).

## Markdown format

```markdown
---
description: "Run tests with coverage"
agent: "build"
model: { "providerID": "anthropic", "model": "claude-haiku-4-5" }
---

Run the full test suite with coverage report and show any failures.
Focus on the failing tests and suggest fixes.
```

Every frontmatter property value is enclosed in double quotation marks —
never bare values (checklist D6); a model selection object keeps its scalar
values quoted.

## Frontmatter keys

| Key | Required | Notes |
| --- | --- | --- |
| `template` | no* | The prompt (JSON config only; in markdown the body is the template). |
| `description` | no | Shown in the TUI command list. |
| `agent` | no | Which agent executes it. Defaults to the current agent. |
| `model` | no | Selection object `{ "providerID": "...", "model": "..." }` — overrides the default model. |
| `subagent` | no | `true` forces a subagent invocation (keeps primary context clean). |
| `subtask` | no | Deprecated alias of `subagent`. |

*In JSON config (`commands.<name>` in `opencode.json`), `template` is
required and `description` identifies the command. Facts §5.

Commands can also be registered programmatically by plugins via
`ctx.command.transform` (a command definition carries `name`, `description`,
and an `execute` handler). Facts §12.

## Template features

> Pending verification: argument substitution behavior below is carried over
> from v1-era guidance and is not adjudicated in opencode-v2-facts — verify
> against the pinned source before relying on specifics.

- `$ARGUMENTS` — full argument string: `/component Button` → `Button`.
- `$1`, `$2`, `$3` — positional args: `/create-file notes.txt src "content"` → `$1`=`notes.txt`, `$2`=`src`, `$3`=`content`.
- `` !`command` `` — inject shell output into the prompt (runs in the project root), e.g. ``!`git log --oneline -10` ``.
- `@path/to/file` — include file content in the prompt.

## Notes

- A custom command with the same name as a built-in overrides it.
- Keep prompts concise and task-focused; the template is the whole instruction the model receives.
