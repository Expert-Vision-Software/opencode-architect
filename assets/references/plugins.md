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

## npm plugin loading mechanics

Verified against the OpenCode source; rely on these when writing plugins that self-install assets.

- Resolution: a `plugin` entry starting with `file://`, `.`, or an absolute path loads from disk as-is; anything else is treated as an npm spec and installed with arborist into `~/.cache/opencode/packages/<sanitized-spec>/node_modules/<name>`. An existing cached `node_modules/<name>` is reused verbatim — including a partial or corrupt install; nothing re-validates or repairs it.
- Import: the entrypoint is picked from `exports["./server"]`, then `main`, then a root `index.{ts,tsx,js,mjs,cjs}`; it must resolve inside the package directory. The module is imported from the real directory (no bundling), so `import.meta.dirname` is the package dir and bundled `assets/` resolve normally.
- Error handling: install/entry/import failures are caught and logged — startup continues. But the wait that joins background npm-install fibers has no timeout, and a hook that rejects during config assembly propagates into config loading: either can stall startup with no visible escape. A plugin must therefore never throw from hooks.
- Config files: global config may be `opencode.json`, `opencode.jsonc`, or `config.json`; project config likewise `.json`/`.jsonc` (`.opencode/opencode.json(c)` and repo root). Anything reading consumer registration must check both extensions.
- `.jsonc` parse semantics: string-aware stripping of `//` and `/* */` comments plus trailing commas, for `.jsonc` only; `.json` stays strict. A `$schema` URL containing `//` must survive; escaped quotes must not break string tracking; the trailing-comma lookahead must skip comments (strip comments first, then trailing commas). Any `.jsonc` reader must pass this fixture matrix: line comment; block comment; trailing comma at array end; trailing comma at object end; comment between a trailing comma and its closer; `$schema` URL containing `//`; a string containing `/*`; an escaped quote inside a string; and a genuinely malformed file, which must stay unparseable and be preserved byte-for-byte.
- Precedence: the effective `plugin` list is the union of global and project entries (project wins on name collision). Agents, commands, and skills are scanned global-first, project-last, with later (project) definitions overriding the same name — so a consumer can override one installed skill or command file per project without touching the global install.
