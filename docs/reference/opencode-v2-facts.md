# opencode v2 verified facts — single source of truth for suite guidance

Issue #24 (child of spec #23). Every opencode v2 API fact taught by this suite must trace to a fact in this record or be flagged as unverified. Facts are adjudicated by the source-of-truth ladder:

1. **Pinned source**: `anomalyco/opencode` at tag **v2.0.23**, commit `0fd7e2829449b052abf0078666669302923d77af`, tagged 2026-10-05 ("release: v2.0.23"). Snapshot taken 2026-10-05. Cited as `source: <repo path>#<Symbol>` (paths relative to the repo root at the pinned commit).
2. **Official v2 docs**: live `opencode.ai/v2/docs/...` pages, and the docs bundled in the snapshot under `packages/web/src/content/docs/`. Cited as `docs: <url>` or `docs(in-repo): <path>`. In-repo docs are **partially stale** (see Contradictions) — they rank below source and are never cited alone for a fact source contradicts.
3. **DeepWiki**: tertiary, never cited in this record for anything the first two settle.
4. **Verification harness** (issue #27): the pinned published v2 contract packages (`@opencode/plugin`, `@opencode/schema`, `@opencode/util`, all 2.0.23) exercised under the repo's Bun runtime by `tests/v2-host.test.ts` and `tests/fixture-config-schema.test.ts`. Cited as `harness: tests/<file>#<test name>`. A harness citation settles only what the published packages can exhibit; it cannot observe the unpublished core host.

Status vocabulary: **settled** (source is definitive), **hedged** (source cannot fully settle; guidance may state it with qualifying wording), **open-harness** (must be confirmed empirically by the verification harness before guidance asserts it as fact).

---

## 1. Plugin-authoring package and exports

- **Package name is `@opencode/plugin`** (v1 was `@opencode-ai/plugin`; no `@opencode-ai/plugin` reference exists anywhere in the v2 source). Settled. `source: packages/plugin/package.json` (`"name": "@opencode/plugin"`, `"version": "2.0.23"`).
- **Subpath exports** (settled, `source: packages/plugin/package.json#exports`):
  - `.` → Promise variant root (`src/promise/index.ts`)
  - `./effect` → Effect variant (`src/effect/index.ts`)
  - `./host` → entrypoint resolution helpers (`src/host.ts`)
  - `./tui` → TUI/CLI plugin surface (`src/tui/index.ts`)
  - `./*` → any other module (e.g. `@opencode/plugin/promise/session` used in docs type imports)
- Effect and Promise variants coexist; `Plugin.define` exists in both (`source: packages/plugin/src/effect/plugin.ts#define`, `packages/plugin/src/promise/plugin.ts#define`).

## 2. Plugin definition shape, lifecycle, storage

- **Default export contract**: a plugin module must default-export `{ id: string, effect }` (Effect) or `{ id: string, setup }` (Promise). Anything else fails loading with "Plugin must export a default definition with an id and an effect or setup function." Settled. `source: packages/core/src/plugin/module.ts#Module` (schema), `#load`.
- **Effect shape**: `{ id, effect(context) => Effect<void, never, Scope.Scope> }`; `effect` receives the full domain context and runs inside a per-plugin forked Scope closed on failure/unload. Settled. `source: packages/plugin/src/effect/plugin.ts#Plugin`, `packages/core/src/plugin.ts#load` (Scope fork/close).
- **Promise shape**: `{ id, setup(context) => Promise<Cleanup|void> | Cleanup | void }`; the returned cleanup runs at unload; a Promise plugin is adapted into the Effect runtime via `PluginPromise.fromPromise`. Settled. `source: packages/plugin/src/promise/plugin.ts#Plugin`, `packages/core/src/plugin/promise.ts`.
- **Context** (both variants, same domains): `app`, `location`, `options`, and domains `agent`, `aisdk`, `command`, `event`, `experimental`, `integration`, `mcp`, `model`, `generate`, `permission`, `plugin`, `provider`, `reference`, `rpc`, `session`, `shell`, `skill`, `storage`, `tool`, `vcs`, `websearch`, `worktree`. Settled. `source: packages/plugin/src/effect/plugin.ts#Context`.
- **Stable `id` is load-bearing**: duplicate IDs die activation; storage is scoped per ID (`PluginHost.storage(kv, plugin.id)`); id identifies the plugin in status/diagnostics. Settled. `source: packages/core/src/plugin.ts#activate` (duplicate check), `packages/core/src/plugin.ts#load` (storage scoping).
- **Lifecycle**: activation diffs the previous generation by (id, revision) — only the changed suffix is reloaded; unchanged prefix registrations stay alive; failed revisions are not retried until the revision changes. Settled. `source: packages/core/src/plugin.ts#activate`.
- **Storage**: `ctx.storage.get/set/remove/scan`, JSON values, scoped to the plugin. Settled. `source: packages/plugin/src/effect/storage.ts#StorageDomain`, `packages/plugin/src/storage.ts#StorageScanOptions/StorageScanResult`.
- **Options**: `{ package, options }` config entries surface as `ctx.options` (`Record<string, any>`). Settled. `source: packages/plugin/src/options.ts#PluginOptions`, `packages/core/src/config/plugin/source.ts#parse`.
- **Non-interference**: load/entry/import failures are caught and logged; a failed transform disables the plugin with error ref but startup continues. Settled. `source: packages/core/src/plugin.ts#load` (`Effect.logWarning("failed to load plugin")`), `#State.group` failure handling.

## 3. Agent domain transform

- `ctx.agent.transform(callback)` registers a `Transform<AgentEditor>`; editor: `list/get/default/update/remove`. Settled. `source: packages/plugin/src/effect/agent.ts#AgentEditor, AgentDomain`; transform type `packages/plugin/src/effect/registration.ts#Transform`.
- Registry rebuild semantics: any registration/removal/`reload()` marks changed; next read replays every active transform in registration order onto a fresh value. Settled. `source: packages/core/src/plugin.ts#activate`; docs: `opencode.ai/v2/docs/build/plugins` (Transforms section, consistent).
- Runtime agent record is `Agent.Info`: `{ id, name, model?, request, system?, description?, mode: "subagent"|"primary"|"all", hidden, color?, steps?, permissions: Ruleset }`. Built-in defaults allow all but ask for `external_directory` and `read` on `.env` files. Settled. `source: packages/schema/src/agent.ts#Info, Info.default` (statics).
- First-party exemplar of the whole pattern (agents from config): `source: packages/core/src/config/plugin/agent.ts#Plugin` (`define({ id: "opencode.config.agent", ... })`).

## 4. Permissions

- **Config key `permissions` is an ordered Ruleset array**: `[{ action: string, resource: string, effect: "allow"|"ask"|"deny" }]`. Last matching rule wins; wildcards allowed in both action and resource (v1's keyed record is normalized — see §9). Settled. `source: packages/schema/src/permission.ts#Rule, Ruleset, Effect`; `packages/core/src/permission.ts#evaluate` (findLast wildcard match).
- **Action vocabulary is an open string**, not an enum; it is the set of tool names plus cross-cutting actions. Observed v2 tool-derived actions: `read`, `edit` (gates the `write`, `edit`, and `patch` tools), `shell`, `subagent`, `glob`, `grep`, `webfetch`, `websearch`, `question`, `skill`; cross-cutting: `*`, `external_directory`, `provider.use` (generated by provider allow/deny-list migration, §5). v1 keys `list`, `todowrite`, `lsp`, `doom_loop` have no v2 tool; rules using those actions are legal but never match. Settled (open-string nature: `source: packages/schema/src/permission.ts#Rule`; tool names: `packages/core/src/tool/plugin/*.ts#name`; edit gating: `packages/core/src/tool-write.test.ts`; renames: `packages/core/src/v1/config/migrate.ts#normalizeAction`; built-ins: `packages/core/src/agent.ts` lines ~60-63, `packages/core/src/file-access.ts#ExternalDirectoryAuthorization`; `provider.use`: `packages/core/src/config/normalize.ts#normalizeExperimental`).
- **External-directory permissions survive in v2**: `external_directory` is a first-class action with batch approval and glob resources; default agent policy asks for it. Settled. `source: packages/core/src/file-access.ts` (approve-in-batch, read boundary), `packages/schema/src/agent.ts#Info.default`.
- **Runtime requests**: `Permission.Request { id, sessionID, action, resources, save?, metadata?, source?, message? }`; replies `once|always|reject`. Settled. `source: packages/schema/src/permission.ts#Request, Reply`.
- **Saved approvals exist**: `PermissionSaved.Info { id, projectID, action, resource, time.created/updated }` and `Request.save: string[]`. Settled. `source: packages/schema/src/permission-saved.ts#Info`.
- **Plugin hook**: `ctx.permission.hook("evaluate", ...)` runs after configured rules for `allow`/`ask` outcomes; explicit configured `deny` is final and skips the hook; hook may rewrite `effect` and set `message`. Settled. `source: packages/plugin/src/effect/permission.ts#PermissionEvaluation, PermissionDomain`; docs: `opencode.ai/v2/docs/build/plugins` (Permissions), consistent.
- Session-scoped rule override: `ctx.permission.rules({ sessionID, permissions })` (Promise API), evaluated after agent rules, inherited by child sessions at creation. Settled. docs: `opencode.ai/v2/docs/build/plugins` (Permissions). Source equivalent: `PermissionApi` on `@opencode/client/effect/api` — **open-harness** (§14.2).

## 5. Config schema keys (v2 `Config.Info`)

All settled from `source: packages/schema/src/config.ts#Info` unless noted:

| Key | v2 type | Notes |
| --- | --- | --- |
| `$schema` | string? | |
| `shell` | string? | |
| `model` | `ConfigModel.Selection {providerID, model, variant?}` | object, not v1's `provider/model` string |
| `default_agent` | string? | unchanged name |
| `update` | `disable\|notify\|auto` | absorbs v1 `autoupdate` |
| `share` | `manual\|auto\|disabled` | absorbs v1 `autoshare` |
| `permissions` | `Permission.Ruleset` (array) | replaces v1 `permission`/`tools` maps |
| `agents` | `Record<string, ConfigAgent.Info>` | replaces v1 `agent` + `mode` |
| `commands` | `Record<string, ConfigCommand.Info>` | replaces v1 `command` |
| `mcp` | `ConfigMCP.Info` (Record name→ServerConfig) | local/remote shapes, see §10 |
| `skills` | string[] (paths or URLs) | absorbs v1 `skills {paths, urls}` |
| `plugins` | `ConfigPlugin.Plugins` array | replaces v1 `plugin`, see §7 |
| `instructions` | string[] | unchanged |
| `references` | `ConfigReference.Info` | absorbs v1 `reference` |
| `snapshots` | boolean? | absorbs v1 `snapshot` |
| `formatter`, `lsp`, `media` (absorbs v1 `attachment`), `tool_output`, `compaction`, `watcher`, `websearch`, `worktree`, `warming`, `providers`, `experimental`, `enterprise`, `username` | objects/scalars | v2-native |
| dropped v1 keys | `logLevel`, `server`, `layout` | rejected as unsupported top-level; `subagent_depth` moved under `experimental` |
| v1 `small_model` | model of the built-in `title` agent (`agents.title.model`) | unparseable refs get an "unsupported" diagnostic. `source: packages/core/src/config/normalize.ts#normalizeLegacy` (legacySmallModel → legacyAgents.title) |
| v1 `enabled_providers` / `disabled_providers` | generated `experimental` permission rules on a `provider.use` action (allow per provider / deny) | `source: packages/core/src/config/normalize.ts#normalizeExperimental` (lines ~388-406) |
| v1 `.well-known` remote config | still exists, reshaped: per-origin `WellKnown.Manifest { auth?, config?, remote_config? }` under an integration ID | `source: packages/core/src/wellknown.ts#Manifest, Entry`, consumed by `packages/core/src/config.ts#loadWellknown` |
| v1 managed config (`/etc/opencode`) | no v2 support found in source | recorded removal. Absence checked across `packages/core/src` |
| v1 `keybinds` / `theme` / `tui` keys | deprecated; auto-migrated "when possible" per in-repo docs | hedged — in-repo docs claim only (`docs(in-repo): packages/web/src/content/docs/config.mdx` line ~296); **open-harness** (§14.8) |

Settled for normalization: `source: packages/core/src/config/normalize.ts` (`unsupportedTopLevel`, legacy decodes); `packages/core/src/v1/config/migrate.ts` (field migrations).

`ConfigAgent.Info` fields: `model` (Selection), `request`, `system`, `description`, `mode` (`subagent|primary|all`), `hidden`, `color` (hex only), `steps`, `disabled`, `permissions`. Settled. `source: packages/schema/src/config/agent.ts#Info`.
`ConfigCommand.Info`: `template`, `description?`, `agent?`, `model?` (Selection), `subagent?`; `subtask` is a deprecated alias. Settled. `source: packages/schema/src/config/command.ts#Info`.

Config file discovery: `opencode.json` and `opencode.jsonc` only — **legacy `config.json` is no longer read**. Roots: global config dir, walked project directories, plus `.opencode/`, `.claude/`, `.agents/` directories; `OPENCODE_CONFIG_DIR` overrides the global dir; `OPENCODE_CONFIG_CONTENT` injects virtual config (highest precedence). Settled. `source: packages/core/src/config/discovery.ts#names, discover`; `packages/core/src/config.ts#load` (ordering: wellknown → global → explicit → direct → project → content).

## 6. v1→v2 agent frontmatter / config-agent mapping

v1 source of truth for what we teach today: `references/AGENTS.md`, `references/config.md`. Mapping, all settled via `source: packages/core/src/v1/config/migrate.ts#migrateAgent` + `packages/core/src/v1/config/agent.ts#AgentSchema.normalize`:

| v1 frontmatter/config | v2 destination |
| --- | --- |
| `prompt` | `system` |
| `model` `"provider/model"` + `variant` | `model: {providerID, model, variant?}` Selection |
| `temperature`, `top_p`, other provider keys | `request.body` (passthrough extras → options → body) |
| `tools` boolean map (deprecated) | `permissions` rules (`true`→allow, `false`→deny; `write`/`edit`/`patch` all → action `edit`) |
| `permission` keyed record | `permissions` array (key → `action`, glob → `resource`, value → `effect`) |
| `maxSteps` (deprecated) | `steps` |
| `disable` | `disabled` |
| `mode`, `description`, `hidden`, `steps`, `color` | unchanged names (`mode` values identical). v1 guidance called `description` required; in v2 it is optional (`ConfigAgent.Info.description` optional; markdown loader assigns only when present — `source: packages/schema/src/config/agent.ts#Info`, `packages/core/src/config/plugin/agent.ts` decode) |
| `color` theme names (`primary` etc.) | hex only; v2 migrates unknown/theme colors to `#aaaaaa` |
| v1 `mode:` config block | merged into `agents` |
| filename-derived agent name | markdown discovery dirs `{agent,agents}/**/*.md`, `{mode,modes}/*.md` (mode files are primary) under config roots |

Settled discovery: `source: packages/core/src/config/plugin/agent.ts#legacySources, sourceDirectories`.

## 7. Plugin registration, discovery, install/distribution

- **Config key is `plugins`** (array). Entries: string or `{ package: string, options?: Record<string, unknown> }`. Settled. `source: packages/schema/src/config/plugin.ts#Entry, Plugin, Plugins`.
- **String forms**: `-target` (or wildcard patterns) = removal/disable; `file://…`, `./…`, `../…`, absolute = local path resolved from the config file's directory; anything else = npm/Git package spec. Settled. `source: packages/core/src/config/plugin/source.ts#parse, scan`.
- **Directory discovery**: every config root is scanned for `plugin/` and `plugins/` children; `.ts`/`.js` files, directories, and symlinks to either are admitted, sorted by path. Settled. `source: packages/core/src/plugin/source-directory.ts#names, discover`.
- **Precedence**: auto-discovered first, explicit config applied last (so config can remove auto-discovered packages); config files merge lowest→highest (global → explicit → direct → project). Settled. `source: packages/core/src/config/plugin/source.ts#scan` (comment + order), `packages/core/src/config.ts#load`. Live docs agree: `docs: opencode.ai/v2/docs/plugins`.
- **Entrypoint resolution** (per package): `exports["./server"]` else package root index (subpaths tried: `server`, ``); `./tui` and `./rpc` exports enable TUI/RPC features. Standalone `.ts`/`.js` files load as-is. The server entrypoint must resolve inside the package directory. Settled. `source: packages/plugin/src/host.ts#Target, Entrypoints, resolve`; `packages/core/src/plugin/module.ts#load` (features tui/rpc, containment check in `config/plugin/source.ts#scan`). **Harness amendment (issue #27): the root-index fallback is unreachable under the Bun runtime — a package whose server-kind candidates both miss is disabled at the entry stage. Every distributed plugin package must declare `exports["./server"]`. Settled. `harness: tests/v2-host.test.ts` (see §14.6).**
- **Install mechanics**: npm/Git specs install via `@npmcli/arborist` (not a shell-out to bun/npm) into a generation cache at `<Global.cache>/npm/<key>/<generation-timestamp>/node_modules/<name>`. Keys: `name@spec` for registry, `git-<slug>-<hash12>` for Git. Loaded generation = newest; startup loads cached immediately and installs missing in background; unpinned specs are checked for updates without auto-upgrade; exact versions and full commit hashes stay pinned; last 2 generations kept, 7-day retention. Settled. `source: packages/util/src/npm.ts` (`directory`, `install`, `collect`, `check`, `update`), `packages/core/src/plugin/supervisor.ts`, `packages/core/src/plugin/update.ts`.
- **CLI management**: `opencode plugin add|list|check|update|remove`; `cli.json` in the global config dir configures CLI-only plugins. Settled. docs: `opencode.ai/v2/docs/plugins`; `source: packages/cli/src/config/config.ts` (`path.join(global.config, "cli.json")`).
- **Local plugin dependencies**: live v2 docs no longer document the v1 `.opencode/package.json` + `bun install` behavior. **open-harness** (§14.1).
- Built-in plugins ignore removals for policy enforcement: ids `opencode.config.policy`, `opencode.provider.opencode`. Settled. docs: `opencode.ai/v2/docs/plugins`; locators in §14.3; **open-harness** (§14.3).

## 8. Tool registration, argument schemas, results

- Registration is via `ctx.tool.transform(editor)` — synchronous, replayable; `ToolEditor { list, get, namespace, add, update, remove }`. Later registrations override the same effective name; namespaced ids are `<namespace>_<name>`. Settled. `source: packages/plugin/src/effect/tool.ts#ToolEditor`; docs: `opencode.ai/v2/docs/build/plugins` (Tools), consistent.
- `Tool.Info = { name, input, description, execute(input, context) => Effect<Result, Tool.Error>, output?, options? }`. **Argument style**: `input` accepts an Effect `Schema.Codec`, any `StandardSchemaV1` (e.g. Zod), or raw `JsonSchema` — v1's `tool.schema` zod-helper style is gone. Settled. `source: packages/schema/src/tool.ts#ValueSchema, Info`.
- **Result shape**: `Tool.Result { output?, content?: string | Array<{type:"text",text}|{type:"file",uri,mime,name?}>, metadata? }`; failures throw/return `Tool.Error { message, error?, metadata? }`. Settled. `source: packages/schema/src/tool.ts#Result, Error, Content`.
- Tool `options`: `{ namespace?, permission?, codemode?, pinned? }` — per-tool permission naming and Code Mode exposure. Settled. `source: packages/schema/src/tool.ts#Options`.
- Executor context: `{ sessionID, agent, messageID, id, progress }` (Effect) plus `signal` (Promise). Settled. `source: packages/schema/src/tool.ts#Context`; docs (Tools) for `context.signal`.
- V1 file-based tool definitions (`.opencode/tools/*.ts` loaded as tools) have **no v2 equivalent in source**; v2 custom tools are plugin-registered. Settled (absence): no tool-file discovery exists in `packages/core/src` (checked config + tool trees). The one-shot upgrade maps them to plugin tools.

## 9. Hook-family map (v1 → v2)

Cross-validated: every row's v2 destination was checked against pinned source symbols; the live migration guide's table (`docs: opencode.ai/v2/docs/build/plugins/migrate-v1`) agrees on every row. Hook registration form: `ctx.<domain>.hook(name, callback)` returns a `Registration` (`{ dispose }`); only `execute.before` may fail the call. Settled. `source: packages/plugin/src/effect/registration.ts#Hooks`.

| v1 hook we teach (`references/plugins.md`) | v2 replacement | Source locator |
| --- | --- | --- |
| returned `event` catch-all | `ctx.event.subscribe()` async-iterable stream | `packages/plugin/src/effect/event.ts#EventDomain` |
| returned `dispose` | cleanup function returned by `setup` | `packages/plugin/src/promise/plugin.ts#Cleanup` |
| returned `config` | per-domain `transform(...)` | `packages/plugin/src/effect/registration.ts#Transform` |
| returned `tool` map + `tool()` helper | `ctx.tool.transform` + `ToolEditor.add` (§8) | `packages/plugin/src/effect/tool.ts` |
| `auth` | `ctx.integration.transform` + integration connect APIs | `packages/plugin/src/effect/integration.ts` |
| `provider` | `ctx.provider.transform` / `ctx.model.transform` | `packages/plugin/src/effect/provider.ts`, `model.ts` |
| `chat.message` | `ctx.session.hook("prompt")` (pre-admission) | `packages/plugin/src/effect/session.ts#SessionPrompt` |
| `chat.params` | `ctx.session.hook("context")` (+ `"compaction"`, `"generate"`, `"title"` per request kind) | `packages/plugin/src/effect/session.ts#SessionHooks` |
| `chat.headers` | `ctx.session.hook("model.request")` or `"http.request"` | `SessionModelRequest`, `SessionHttpRequest` (same file) |
| `permission.ask` | `ctx.permission.hook("evaluate")` (§4) | `packages/plugin/src/effect/permission.ts` |
| `tool.execute.before` | `ctx.tool.hook("execute.before")` (may reject) | `packages/plugin/src/effect/tool.ts#ToolHooks, ToolFailures` |
| `tool.execute.after` | `ctx.tool.hook("execute.after")` (`status: completed\|error`) | same |
| `shell.env` | `ctx.shell.hook("create.before")` (command, cwd, timeout, shell, env) | `packages/plugin/src/effect/shell.ts#ShellHooks` |
| `experimental.chat.system.transform` | `session.hook("context")`, edit `event.system` | `packages/plugin/src/effect/session.ts#SessionContext` |
| `experimental.chat.messages.transform` | `session.hook("context")`, edit `event.messages` | same |
| `experimental.session.compacting` | `session.hook("compaction")`; set `result` to skip the model call | `SessionCompaction`, `SessionCompactionResult` (same file) |
| `command.execute.before` | no 1:1 hook: command `transform` (if plugin owns it) or prompt hook | `packages/plugin/src/effect/command.ts#CommandDomain` |
| TUI hooks (`tui.prompt.append` etc.) | TUI/CLI plugin surface via `./tui` export + `cli.json` (§11) | `packages/plugin/src/tui/plugin.ts#Definition` |
| v1 experimental hooks without successors (`experimental.compaction.autocontinue`, `experimental.provider.small_model`, `experimental.text.complete`) | removed; re-evaluate against session/provider/model APIs | docs: migrate-v1 (no successor) |

Settled additions we teach as v2-native: `session.hook("retry")` (override retry decisions), `session.hook("http.response")`, `experimental.ws.handshake/send/receive` (experimental — hedge in guidance per §14.5). Settled. `source: packages/plugin/src/effect/session.ts#SessionHooks`.
Model-domain hooks are provider-scopable via `{ providerID }` (`ModelHooks` options). Settled. `source: packages/plugin/src/effect/registration.ts#ModelHooks`.

## 10. MCP surface

- v2 `mcp` config: `Record<string, Mcp.ServerConfig>`; `LocalConfig { type:"local", command: string[], cwd?, environment?, disabled?, codemode?, timeout? {startup,catalog,execution}, protocol? "legacy"|"auto"|"2026-07-28" }`, `RemoteConfig { type:"remote", url, headers?, oauth? {client_id, client_secret, scope, callback_port, redirect_uri, auth_server_metadata_url} | false, disabled?, codemode?, timeout?, protocol? }`. Settled. `source: packages/schema/src/mcp.ts#LocalConfig, RemoteConfig, OAuthConfig, TimeoutConfig, Protocol`.
- v1→v2 migration (command string→array; snake_case oauth; timeout split): settled. `source: packages/core/src/v1/config/migrate.ts#migrateMcp`.
- Plugin surface: `ctx.mcp.transform(editor)` with `list/get/set/update/remove`, `disabled` toggles reconciliation, `reload()` reapplies. Settled. `source: packages/plugin/src/effect/mcp.ts#MCPEditor, MCPDomain`.

## 11. TUI, RPC, Effect surfaces we recommend

- **Effect-first is the house style for our port and templates**: `@opencode/plugin/effect`, `Plugin.define({ id, effect(ctx) {...} })`; Promise API (`@opencode/plugin` root, `setup`) documented as the fallback for trivial plugins. Settled (spec decision + source §1–2).
- **TUI plugins**: separate `Definition { id, setup(context) }` under `@opencode/plugin/tui` with Solid helpers (`PluginContextProvider`, `usePlugin`); enabled by a package's `./tui` export; configured via `cli.json` for CLI-only plugins. Settled. `source: packages/plugin/src/tui/plugin.ts, tui/solid.ts`; `packages/core/src/plugin/module.ts` (tui feature flag); `packages/cli/src/config/config.ts`.
- **Plugin RPC**: `ctx.rpc.register(definition, handlers)` with `Rpc.Definition` contracts, event emit/subscribe, and an optional `./rpc` package export so clients can import the contract without loading the implementation. Settled. `source: packages/plugin/src/effect/rpc.ts#RpcDomain, RpcHandlers`; docs: `opencode.ai/v2/docs/build/plugins` (Publish).
- **AISDK/provider hooks** (`ctx.aisdk.hook("sdk"|"language")`) for provider SDK injection. Settled. `source: packages/plugin/src/effect/aisdk.ts#AISDKHooks`.

## 12. Command/skill/agent markdown surfaces

- Commands: `command/` + `commands/` dirs under config roots; frontmatter → `ConfigCommand.Info`; markdown body → template; `ctx.command.transform` can register programmatic commands (`CommandDefinition { name, description?, execute(invocation) }`). Settled. `source: packages/core/src/config/plugin/command.ts` (`sourceDirectories`, `loadDirectory`), `packages/plugin/src/effect/command.ts#CommandDefinition`.
- Skills: `skill/` + `skills/` dirs under config roots plus config `skills` paths/URLs; `SKILL.md` with gray-matter frontmatter; `Skill.Info { id, name, description?, autoinvoke?, path, content }`; `ctx.skill.transform`. Unquoted YAML colons are sanitized for cross-agent compatibility. Settled. `source: packages/core/src/config/plugin/skill.ts`, `skill-file.ts#parse`, `packages/core/src/config/markdown.ts#sanitize`, `packages/schema/src/skill.ts#Info`.
  - v1 skill frontmatter fate (our `references/skills.md` teaches it): `name` no regex-enforced and no longer must match the folder — it defaults to the directory/file-derived id when absent (`skill-file.ts#parse`); `description` optional in the parser (v1 "required" is stale as a loader rule, though selection quality still depends on it — keep guidance-required for authoring); `license`, `compatibility`, and free-form `metadata` are **dropped** — not carried into `Skill.Info` (only `metadata["opencode/autoinvoke"]` is read, plus a `disable-model-invocation` boolean → `autoinvoke`). Settled. `source: packages/core/src/config/plugin/skill-file.ts#parse`.
- Agents: §3 and §6. Settled.
- v1 `agents.md`/`AGENTS.md` ambient instructions and `instructions` config key remain in v2 (instruction discovery present). Settled. `source: packages/core/src/instruction-discovery.ts` (exists); details of file names — **open-harness** (§14.4).

## 13. Contradictions adjudicated

| # | Contradiction | Resolution |
| --- | --- | --- |
| 1 | In-repo v2.0.23 docs (`packages/web/src/content/docs/plugins.mdx`) still teach v1 (`@opencode-ai/plugin`, hooks object, `plugin` key, `~/.cache/opencode/node_modules`) | Source wins: `@opencode/plugin`, context domains, `plugins` key, generation cache `<cache>/npm/<key>/<gen>`. In-repo docs treated as stale v1-era content. Settled. |
| 2 | Live docs `/docs/plugins` (v1 path) vs `/v2/docs/plugins` differ | Only `/v2/docs/*` counts as official v2 docs; validated against source — all checked claims agree. Settled. |
| 3 | Our `references/config.md` teaches global `config.json` as a config candidate | v2 discovery reads only `opencode.json`/`opencode.jsonc` (`config/discovery.ts#names`). Guidance must drop `config.json`. Settled. |
| 4 | Our `references/plugins.md` load-order claim ("global config → project config → global dir → project dir") | v2: auto-discovered directories activate before explicit config; explicit config applies last and can remove; config file merge is lowest→highest by root depth. Rewrite guidance. Settled. |
| 5 | Our `references/AGENTS.md` color guidance ("hex or theme color") | v2 accepts hex only; theme names normalize to `#aaaaaa` during migration. Settled (`schema/src/config/agent.ts#Color`, `v1/config/migrate.ts#migrateAgent`). |
| 6 | Migration-guide claim "V2 discovers `.opencode/plugin/` and `.opencode/plugins/`" | Confirmed in source (`source-directory.ts#names`). Settled — guide assertion validated. |
| 7 | Migration-guide claim "npm plugins installed automatically using Bun" appears only in stale in-repo docs | Source uses arborist directly, no bun. Settled. |
| 8 | `CONTEXT.md` glossary "Plugin install" still says the package is listed in a config file's `plugin` array | Record is right for v2 (`plugins`); the glossary entry needs a v2 update — flagged here for the domain-docs pass per `docs/agents/domain.md`. Open (doc debt, not a source question). |
| 9 | C1's working assumption "root-index fallback works locally via `Host.resolve`" | **Settled negative** (issue #27). The published `Host.resolve` filters candidate misses through `error instanceof Error`, but Bun's `ResolveMessage` (thrown by `Bun.resolveSync`, which `@opencode/util/runtime-import` uses under Bun) is **not an `Error`** (`harness` probe, oven-sh/bun#7531) — the first missed candidate rethrows and later candidates never run; the aggregate call also evaluates `tui`/`rpc` eagerly, so it throws for any package without `./tui`. The core loader resolves **per kind** with try/catch (entry-stage failure disables that one plugin; startup continues — tertiary DeepWiki reading of `packages/opencode/src/plugin/loader.ts`, the snapshot's `packages/core` paths unpublished), so a package whose `server` candidate misses is silently disabled. Consequence: `exports["./server"]` is mandatory; `opencode-architect` declares it as of issue #27, and generated-package templates lack it (flagged for the guidance tickets). Settled. `harness: tests/v2-host.test.ts` |

## 14. Open flags → verification-harness inputs

Facts the pinned source cannot fully settle. The harness (issue #27, `tests/v2-host.test.ts` + `tests/fixture-config-schema.test.ts`) reaches only the published plugin-contract surface; items needing the unpublished core host runtime carry an explicit reachability disposition and stay **open-harness** until a core-host harness exists.

1. Local plugin dependency installation at startup (whether a `package.json` beside local plugins triggers install, and with which package manager) — §7. **Not reachable**: lives in the core supervisor/install path; the published packages expose no install machinery. Remains open-harness.
2. `ctx.permission.rules()` session-scoped override end-to-end behavior (inheritance timing for child sessions) — §4. **Not reachable**: needs a live session runtime. Remains open-harness.
3. Built-in unremovable plugin ids `opencode.config.policy` / `opencode.provider.opencode` as observed at runtime — §7. Source locator: `opencode.config.policy` in `packages/core/src/config/plugin/policy.ts`; `opencode.provider.opencode` in `packages/core/src/plugin/provider/opencode.ts` (not in policy.ts); a third built-in, `opencode.config.agent` (`packages/core/src/config/plugin/agent.ts`), has no removal-override claim in docs. **Not reachable**: built-ins are core-registration behavior. Remains open-harness.
4. Instruction-file discovery set (exact ambient filenames, e.g. `AGENTS.md` variants) — §12. **Not reachable**: discovery runs inside the core config loader. Remains open-harness.
5. `experimental.ws.*` hook stability (names/shapes may change; treat as hedged in guidance until then) — §9. **Partially confirmed**: the pinned 2.0.23 types expose the documented shapes; stability across versions cannot be observed from one pin. Remains hedged in guidance.
6. ~~Generated-package compatibility: whether a plugin package whose exports expose only `.` (no `./server`) loads from npm cache~~ — **Settled negative (issue #27)**. Under the Bun runtime the root-index fallback never runs: the server-kind candidate miss throws a `ResolveMessage` that the published resolution code cannot catch (it filters on `error instanceof Error`), so the core loader disables the plugin at the entry stage. The root-index fallback only ever worked where candidate misses are catchable `Error`s (Node). Every plugin package must declare `exports["./server"]`; `opencode-architect` does as of issue #27, generated-package templates must follow (see §13 row 9). `harness: tests/v2-host.test.ts`
7. TUI plugin lifecycle under `opencode` TUI host (feature flag exists in server; TUI-side load order not visible in server source) — §11. **Not reachable**: needs the TUI host process. Remains open-harness.
8. Whether v1 `keybinds`/`theme`/`tui` keys auto-migrate, and to what, at runtime — §5 (in-repo docs claim only). **Not reachable**: migration runs in the core config loader; the published schema ignores unknown keys and cannot observe it. Remains open-harness.

Harness coverage that IS settled empirically at the pinned versions (issue #27): the built `opencode-architect` entry satisfies the v2 Module contract and, activated the way the host activates plugins, registers all ten agents (each decoding against `@opencode/schema` `Agent.Info`) plus exactly one permission `evaluate` hook that rewrites bundled `external_directory` asks (`harness: tests/v2-host.test.ts`); every config file the installer/editor produces — created default, splices into rich v2 configs, legacy-tolerated no-ops, and the README quick-start snippet — decodes against the pinned `Config.Info` (`harness: tests/fixture-config-schema.test.ts`). CI gates both via the `V2 verification harness` job.

## 15. Rules for guidance tickets (C5–C7, the guidance-rewrite children of spec #23)

- A reference/template/agent-definition sentence may assert a fact only if that fact is **settled** here, or **hedged** with the qualifying wording from this record. **open-harness** facts may only appear behind an explicit "pending verification" note.
- Cite the fact by section number (e.g. "per opencode-v2-facts §8") rather than restating fragile details.
- When adjudicating new contradictions during the rewrite, extend §13 here rather than resolving locally.
- Dependency-citation policy (adjudicated during C2, issue #25): the opencode-architect runtime pins the packages it executes (`@opencode/plugin` 2.0.23, `effect` 4.0.0-rc.112 at execution time; 2.0.24 was `latest` then — flagged, not adopted). Guidance sentences and templates naming the plugin-authoring packages **for consumers** must use `@latest` (e.g. `"@opencode/plugin": "latest"`, `"effect": "latest"`) so generated and taught packages resolve current versions at time of use. Never teach a pinned consumer version from guidance.
