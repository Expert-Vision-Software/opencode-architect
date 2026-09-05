# OpenCode commands — fundamentals

Custom commands are prompt templates invoked as `/name` in the TUI, in addition to built-ins (`/init`, `/undo`, `/redo`, `/share`, `/help`).

Locations:

- Project: `.opencode/commands/`
- Global: `~/.config/opencode/commands/`

The filename becomes the command name (`test.md` → `/test`).

## Markdown format

The frontmatter defines properties; the body is the prompt template.

```markdown
---
description: Run tests with coverage
agent: build
model: anthropic/claude-haiku-4-5
---

Run the full test suite with coverage report and show any failures.
Focus on the failing tests and suggest fixes.
```

## Frontmatter keys

| Key | Required | Notes |
| --- | --- | --- |
| `description` | no* | Shown in the TUI command list. |
| `template` | no* | The prompt (JSON config only; in markdown the body is the template). |
| `agent` | no | Which agent executes it. Defaults to the current agent. |
| `model` | no | Overrides the default model. |
| `subtask` | no | `true` forces a subagent invocation (keeps primary context clean), even for `primary`-mode agents. |

*In JSON config (`command.<name>` in `opencode.json`), `template` is required and `description` identifies the command.

## Template features

- `$ARGUMENTS` — full argument string: `/component Button` → `Button`.
- `$1`, `$2`, `$3` — positional args: `/create-file config.json src "content"` → `$1`=`config.json`, `$2`=`src`, `$3`=`content`.
- `` !`command` `` — inject shell output into the prompt (runs in the project root), e.g. ``!`git log --oneline -10` ``.
- `@path/to/file` — include file content in the prompt.

## Notes

- A custom command with the same name as a built-in overrides it.
- Keep prompts concise and task-focused; the template is the whole instruction the model receives.
