# OpenCode plugins — fundamentals

Plugins are packages that register agents, tools, hooks, and MCP changes with
a running OpenCode host through context domains. Everything below is v2
(Effect-first), adjudicated against the pinned source: facts per
`docs/reference/opencode-v2-facts.md` §1–2 (definition, lifecycle), §7
(registration, install), §8 (tools), §9 (hooks), §10 (MCP), §11 (TUI/RPC).
General Effect-TS teaching is out of scope here — see the repo's effect-ts
skill.

## Authoring package

- Package: `@opencode/plugin` (consumer guidance resolves `latest`).
- Subpath exports: `.` (Promise root), `./effect` (Effect variant — house
  style), `./host` (entrypoint resolution helpers), `./tui` (TUI/CLI surface),
  `./*` (any other module). Facts §1.

## Plugin definition

The entry module default-exports a definition; the stable `id` is
load-bearing (storage scoping, diagnostics; duplicate ids die activation):

```ts
import { Effect } from "effect"
import { Plugin } from "@opencode/plugin/effect"

export default Plugin.define({
  id: "my-plugin",
  effect: (context) =>
    Effect.gen(function* () {
      // register via context domains
    }),
})
```

- **Effect shape**: `{ id, effect(ctx) }` — the effect runs in a per-plugin
  forked Scope, closed on failure/unload. House style. Facts §2.
- **Promise shape**: `{ id, setup(ctx) }` — return a cleanup function (or
  Promise of one); it runs at unload. Documented fallback for trivial
  plugins. Facts §2.
- Anything else fails loading: "Plugin must export a default definition with
  an id and an effect or setup function." Facts §2.
- **Context** carries `app`, `location`, `options`, and the domains: `agent`,
  `aisdk`, `command`, `event`, `experimental`, `integration`, `mcp`, `model`,
  `generate`, `permission`, `plugin`, `provider`, `reference`, `rpc`,
  `session`, `shell`, `skill`, `storage`, `tool`, `vcs`, `websearch`,
  `worktree`. Facts §2.
- **Lifecycle**: activation diffs the previous generation by (id, revision) —
  only the changed suffix reloads; unchanged registrations stay alive; a
  failed revision is not retried until the revision changes. Facts §2.
- **Storage**: `ctx.storage.get/set/remove/scan` — JSON values, scoped to
  your plugin's id. **Options**: `{ package, options }` config entries
  surface as `ctx.options`. Facts §2.

## Registration and discovery

- Config key is **`plugins`** (plural array) in `opencode.json`/`opencode.jsonc`
  — v2 never reads `config.json`. Entries: a package spec string, or
  `{ package, options }`. A `-target` entry removes/disables; `file://`,
  `./`, `../`, or absolute specs load from disk (resolved from the config
  file's directory); anything else is an npm/Git spec. Facts §5, §7.
- Directory discovery: every config root is scanned for `plugin/` and
  `plugins/` children; `.ts`/`.js` files, directories, and symlinks load.
  Project: `.opencode/plugin/` (or `plugins/`). Global:
  `~/.config/opencode/plugin/` (or `plugins/`). Facts §7.
- **Precedence**: auto-discovered directories activate first; explicit config
  applies last (so config can remove auto-discovered packages); config files
  merge lowest→highest (global → explicit → direct → project). Facts §7.

## Domains: how plugins change behavior

Registration is replayable: any registration/removal/`reload()` marks the
registry changed, and the next read replays every active transform in
registration order onto a fresh value. Facts §3.

- **Agents**: `ctx.agent.transform((editor) => ...)` — editor
  `list/get/default/update/remove`. Facts §3.
- **Tools**: `ctx.tool.transform((editor) => ...)` — editor
  `list/get/namespace/add/update/remove`; later registrations override the
  same effective name; namespaced ids are `<namespace>_<name>`. Facts §8.

  ```ts
  context.tool.transform((editor) => {
    editor.add({
      name: "validate-commit",
      description: "Validate a commit message against conventional commits",
      input: {
        type: "object",
        properties: { message: { type: "string", description: "The message" } },
        required: ["message"],
      },
      execute: (args, ctx) =>
        Effect.succeed({
          output: /^(feat|fix|docs|chore)(\(.+\))?: .+/.test(args.message)
            ? "valid"
            : "invalid",
        }),
    })
  })
  ```

  `input` accepts raw JSON Schema, an Effect `Schema.Codec`, or any
  Standard-Schema validator (e.g. Zod) — the v1 `tool.schema` helper style is
  gone. Results: `{ output?, content?, metadata? }`; failures
  `Tool.Error { message }`. Per-tool `options`: `{ namespace?, permission?,
  codemode?, pinned? }`. Facts §8.
- **Hooks**: `ctx.<domain>.hook(name, callback)` returns a `Registration`
  (`{ dispose }`); only `execute.before` may fail the call. Facts §9.
- **Permissions**: `ctx.permission.hook("evaluate", ...)` runs after
  configured rules for `allow`/`ask` outcomes; explicit configured `deny` is
  final and skips the hook; the hook may rewrite `effect` and set `message`.
  Facts §4.
- **Events**: `ctx.event.subscribe()` — an async-iterable stream replaces the
  v1 catch-all `event` hook. Facts §9.
- **MCP**: `ctx.mcp.transform((editor) => ...)` with
  `list/get/set/update/remove`; `disabled` toggles reconciliation;
  `reload()` reapplies. Facts §10.
- **Providers/models**: `ctx.provider.transform`, `ctx.model.transform`;
  provider-SDK injection via `ctx.aisdk.hook("sdk" | "language")`. Facts §9, §11.

## Hook-family map (v1 → v2)

The v1 names below appear only as migration input; nothing in v2 uses them.
Full table: facts §9.

| v1 hook | v2 replacement |
| --- | --- |
| returned `event` catch-all | `ctx.event.subscribe()` stream |
| returned `dispose` | cleanup returned by Promise `setup` |
| returned `config` | per-domain `transform(...)` |
| returned `tool` map + `tool()` helper | `ctx.tool.transform` + `ToolEditor.add` |
| `auth` | `ctx.integration.transform` + connect APIs |
| `provider` | `ctx.provider.transform` / `ctx.model.transform` |
| `chat.message` | `ctx.session.hook("prompt")` |
| `chat.params` | `ctx.session.hook("context")` (+ kind hooks) |
| `chat.headers` | `ctx.session.hook("model.request")` or `"http.request"` |
| `permission.ask` | `ctx.permission.hook("evaluate")` |
| `tool.execute.before` / `.after` | `ctx.tool.hook("execute.before" / "execute.after")` |
| `shell.env` | `ctx.shell.hook("create.before")` |
| TUI hooks | `@opencode/plugin/tui` definition + `cli.json` |

Settled v2-native additions we recommend: `session.hook("retry")`,
`session.hook("http.response")`, `experimental.ws.*` (treat as unstable —
hedged, facts §9, §14.5).

## Install and distribution mechanics

- Entrypoint resolution per package: `exports["./server"]` first; `.ts`/`.js`
  files load as-is; the entry must resolve inside the package directory.
  **Every distributed package must declare `exports["./server"]`** — the
  root-index fallback is runtime-dependent (dead on Bun 1.3.x, disabled at
  the entry stage) and must not be relied on. Facts §7, §13 row 9, §14.6;
  `harness: tests/v2-host.test.ts`.
- npm/Git specs install via `@npmcli/arborist` into a generation cache at
  `<cache>/npm/<key>/<generation-timestamp>/node_modules/<name>`; the newest
  generation loads; startup loads cached immediately and installs missing in
  the background; unpinned specs are checked for updates without
  auto-upgrade; exact versions and full commit hashes stay pinned; last 2
  generations kept, 7-day retention. Facts §7.
- CLI management: `opencode plugin add|list|check|update|remove`;
  `cli.json` in the global config dir configures CLI-only plugins. Facts §7.

## Non-interference

Load/entry/import failures are caught and logged; a failed plugin is
disabled with an error ref, and startup continues. A plugin must never throw
from its startup path (ADR-0007 invariant, unchanged in v2). Facts §2.

## Editing consumer configs (surgical writer)

Rules for any code that adds a `plugins` entry to a consumer's config —
load-bearing invariants:

- **Allowed candidates.** `.opencode/opencode.json(c)` and repo-root
  `opencode.json(c)` (project scope); global `~/.config/opencode/opencode.json(c)`
  (or `$XDG_CONFIG_HOME/opencode/`). A global legacy `config.json` is a
  read-only candidate only: v2 never reads it, so an entry there is inert —
  warn and point the consumer at `opencode.json(c)`; never edit it.
- **Write the plural key.** New entries splice into the `plugins` array as
  `name@latest`. A legacy singular `plugin` entry is tolerated read-only:
  reported with an upgrade advisory, never rewritten or silently migrated
  (facts §13 row 10).
- **Surgical writes.** Text splice into the array only — every other byte
  (indentation, comments, trailing commas, key order, unrelated keys)
  untouched; never parse-then-reserialize; a parse error aborts, preserving
  the file byte-for-byte.
- **Zero-write no-op.** A semantically matching entry (`name`, `name@latest`,
  `name@x.y.z`) means write nothing — even when the existing spelling is
  non-canonical.
