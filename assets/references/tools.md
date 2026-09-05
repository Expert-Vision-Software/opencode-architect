# OpenCode tools — fundamentals

By default all tools are enabled and need no permission to run. Control them via the `permission` config (global or per agent).

## Built-in tools

| Tool | Purpose | Permission key |
| --- | --- | --- |
| `bash` | Execute shell commands | `bash` |
| `read` | Read files (supports line ranges) | `read` |
| `edit` | Exact string replacement in files | `edit` |
| `write` | Create/overwrite files | `edit` |
| `apply_patch` | Apply patch files | `edit` |
| `grep` | Regex content search | `grep` |
| `glob` | File pattern matching | `glob` |
| `skill` | Load a SKILL.md | `skill` |
| `todowrite` | Task lists (disabled for subagents by default) | `todowrite` |
| `webfetch` | Fetch a URL | `webfetch` |
| `websearch` | Web search (provider/env gated) | `websearch` |
| `question` | Ask the user structured questions | `question` |
| `lsp` | LSP intelligence (experimental) | `lsp` |

`edit`, `write`, and `apply_patch` share the single `edit` permission. `grep`/`glob` use ripgrep and respect `.gitignore` (a `.ignore` file can re-include paths). Hooks must check `input.tool === "apply_patch"` and use `output.args.patchText` (paths embedded in marker lines).

## Custom tools

Defined in `.opencode/tools/` (project) or `~/.config/opencode/tools/` (global). The filename becomes the tool name (`database.ts` → `database` tool).

```ts
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Query the project database",
  args: {
    query: tool.schema.string().describe("SQL query to execute"),
  },
  async execute(args, context) {
    return `Executed: ${args.query}`
  },
})
```

Key API points:

- `tool.schema` is Zod (`tool.schema.string()`, `.number()`, `.describe(...)`); or import `zod` directly and export a plain object.
- `execute(args, context)` — context provides `agent`, `sessionID`, `messageID`, `directory` (session cwd), `worktree` (git worktree root). Use `context.worktree` for repo-root paths.
- Multiple named exports in one file become separate tools named `<filename>_<exportname>` (`math_add`, `math_multiply`).
- A custom tool with a built-in tool's name overrides it (prefer unique names; use permissions to just disable).
- The definition is TS/JS, but `execute` can invoke scripts in any language (e.g. via `Bun.$`).
