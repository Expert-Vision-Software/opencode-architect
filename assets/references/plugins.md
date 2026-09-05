# OpenCode plugins — fundamentals

Plugins are JS/TS modules that hook into OpenCode events and customize behavior.

Locations:

- Project: `.opencode/plugins/`
- Global: `~/.config/opencode/plugins/`

Files in these directories load automatically at startup. npm packages can be loaded via the `plugin` array in `opencode.json`. Load order: global config → project config → global plugin dir → project plugin dir.

## Plugin shape

A plugin exports one or more async functions. Each receives a context and returns a hooks object:

```ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // hook implementations
  }
}
```

Context: `project` (project info), `directory` (cwd), `worktree` (git worktree root), `client` (opencode SDK client), `$` (Bun shell API).

## Config hooks

Returning a `tool` object adds custom tools; a plugin tool that shares a built-in tool's name takes precedence:

```ts
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "What the tool does",
        args: { foo: tool.schema.string() },
        async execute(args, context) {
          const { directory, worktree } = context
          return `Hello ${args.foo} from ${directory}`
        },
      }),
    },
  }
}
```

## Event hooks

Hooks are named event handlers: `"<event>": async (input, output) => { ... }`.

Key events:

- Commands: `command.executed`
- Files: `file.edited`, `file.watcher.updated`
- Messages: `message.updated`, `message.part.updated`, `message.part.removed`, `message.removed`
- Permissions: `permission.asked`, `permission.replied`
- Sessions: `session.created`, `session.idle`, `session.updated`, `session.error`, `session.compacted`, `session.deleted`, `session.diff`, `session.status`
- Tools: `tool.execute.before`, `tool.execute.after`
- Shell: `shell.env`
- TUI: `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`
- Other: `installation.updated`, `lsp.client.diagnostics`, `lsp.updated`, `server.connected`, `todo.updated`

A catch-all `event: async ({ event }) => {...}` hook receives every event (`event.type` switches on it).

`tool.execute.before` can inspect/modify `output.args` or throw to block; `shell.env` mutates `output.env`.

Compaction hook `experimental.session.compacting` can append via `output.context.push(...)` or fully replace the prompt via `output.prompt`.

## Dependencies and logging

- Local plugins can use npm packages: add a `package.json` to the config directory (`.opencode/package.json`); OpenCode runs `bun install` at startup.
- Prefer structured logging via `client.app.log({ body: { service, level, message, extra } })` over `console.log`. Levels: `debug`, `info`, `warn`, `error`.
