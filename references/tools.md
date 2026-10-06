# OpenCode tools — fundamentals

Control tools through the `permissions` config — an ordered ruleset array
(global or per agent); actions are open strings named after tools plus
cross-cutting actions. Facts per `docs/reference/opencode-v2-facts.md` §4
(actions), §8 (tool shape, registration).

## Tool actions

Observed v2 tool-derived permission actions — `edit` gates all file
modification (`write`, `edit`, and `patch` tools):

| Action | Purpose |
| --- | --- |
| `read` | Read files |
| `edit` | File modification — `write`, `edit`, `patch` |
| `shell` | Execute shell commands |
| `subagent` | Delegate to subagents |
| `glob` | File pattern matching |
| `grep` | Content search |
| `skill` | Load a SKILL.md |
| `webfetch` | Fetch a URL |
| `websearch` | Web search (provider/env gated) |
| `question` | Ask the user structured questions |
| `*` | Cross-cutting catch-all |
| `external_directory` | Reads outside the workspace (asks by default, batch approval, glob resources) |

Wildcard rules: `permissions: [{ "action": "shell", "resource": "git *",
"effect": "allow" }]`. Last matching rule wins. Facts §4.

## Custom tools — plugin-registered

v2 has **no file-based tool definition**: the v1 `.opencode/tools/`
convention has no v2 equivalent. Custom tools are registered by plugins via
the tool domain; the one-shot upgrade maps v1 tool files to plugin tools.
Facts §8.

```ts
context.tool.transform((editor) => {
  editor.add({
    name: "query-database",
    description: "Query the project database",
    input: {
      type: "object",
      properties: {
        query: { type: "string", description: "SQL query to execute" },
      },
      required: ["query"],
    },
    execute: (args, ctx) => Effect.succeed({ output: ran(args.query) }),
  })
})
```

Key API points:

- Definition: `{ name, input, description, execute(input, context), output?,
  options? }`. `execute` returns an `Effect<Result, Tool.Error>`. Facts §8.
- **Argument schemas**: `input` accepts raw JSON Schema (above), an Effect
  `Schema.Codec`, or any Standard-Schema validator (e.g. Zod) — the v1
  `tool.schema` helper style is gone. Facts §8.
- **Results**: `{ output?, content?, metadata? }` — `content` may be a string
  or typed file parts. Failures: `Tool.Error { message }`. Facts §8.
- Executor context: `{ sessionID, agent, messageID, id, progress }`. Facts §8.
- `options`: `{ namespace?, permission?, codemode?, pinned? }` — per-tool
  permission naming and Code Mode exposure; namespaced ids are
  `<namespace>_<name>`. Later registrations override the same effective
  name. Facts §8.
- `execute` can invoke scripts in any language (e.g. via `Bun.$`).
