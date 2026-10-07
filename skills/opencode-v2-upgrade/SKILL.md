---
name: "opencode-v2-upgrade"
description: "Upgrades a consumer's OpenCode v1 extension package or .opencode/ tree to OpenCode v2 in one pass: extension inventory, plugin code port to the Effect-first plugin API, v1 tool-file port to plugin-registered tools, config rewrite to v2-native keys, and a v2 capability recommendations report. Use when the user asks to upgrade, migrate, or modernize a plugin, custom tools, or an extensions package from OpenCode v1 to v2."
---

# OpenCode v2 one-shot consumer upgrade

Run a v1 → v2 upgrade for one project in a single pass. Every opencode API
claim below traces to the suite's verified-facts record (cited as "facts §n");
the mapping and rules in this skill are self-contained, so cite the fact
number rather than restating fragile API details. The facts record itself
lives in the suite repository as `opencode-v2-facts.md` — a maintainer source
of truth, not a consumer runtime dependency.

## Done when

- An inventory of the project's extensions exists, each classified v1 or v2.
- Every v1 plugin file runs under the v2 Effect-first plugin API.
- Every v1 file-based tool file is a plugin-registered tool.
- Every consumer config is rewritten to v2-native keys per the mapping below.
- A recommendations report names the v2 capabilities worth adopting.
- Already-v2 projects are left byte-for-byte untouched (a clean no-op).

## Safety contract (non-negotiable)

1. **Never touch the OpenCode application installation.** Do not install,
   upgrade, pin, or remove the `opencode` binary, its global cache, or its
   npm package. The upgrade changes the consumer's project only (facts §7).
2. **No-op on already-v2 projects.** If the inventory finds no v1 remnant,
   stop and report zero changes. Re-running the upgrade is always safe
   (facts §5, §6, §9).
3. **Never clobber consumer-modified files.** Before rewriting any file the
   suite's manifest tracks (`<scope base>/<package>.manifest.json`), compare
   its current sha256 against the recorded hash. On mismatch, skip the file
   with a warning and list it in the report; taking ownership is CLI-only
   behind an explicit `--force` (facts §5, §13 row 10). Manifest rules are
   the source of truth: version match alone is not enough.
4. **Preserve what you cannot parse.** A config file that fails to parse is
   reported and left byte-for-byte; never rewrite it from an empty object
   (facts §5, §13 row 3).
5. **Surgical config writes.** Splice v2 keys into place; never
   parse-and-reserialize a file with comments or custom formatting.
6. **Legacy entries are read-only.** A singular v1 `plugin` entry — and the
   inert legacy `config.json` candidate — are reported with an upgrade
   advisory, never silently rewritten (facts §13 row 3).

## Phase 1 — Inventory (extension auditor)

Delegate to `opencode-extension-auditor` in inventory mode. It scans the
discovered config roots for both directory spellings (facts §12):

- skills: `skill/` + `skills/` (a `SKILL.md` per directory)
- commands: `command/` + `commands/`
- agents: `agent/` + `agents/`
- plugins: `plugin/` + `plugins/` (TypeScript or JavaScript)
- configs: `opencode.json` / `opencode.jsonc` at the global and project roots
- v1 file-based tool files: v1 `.opencode/tools/*.ts` (no v2 equivalent)

Record per extension: type, name, path, v1 or v2, and the specific v1
remnants found. The auditor's report is the input to every later phase.

## Phase 2 — Classify the project

Stop here when the auditor reports no v1 remnant: report the clean no-op and
list what made the project v2-native. Classify every remaining finding by the
mapping tables below, then run phases 3–5.

## Phase 3 — Config rewrite (verified mapping)

Rewrite each config to v2-native keys. All facts §5 unless noted.

| v1 key | v2 destination |
| --- | --- |
| `plugin` (singular) | `plugins` (array: `name@latest` strings or `{ package, options }`) |
| `permission` (keyed record) | `permissions` (ordered `{ action, resource, effect }` ruleset array, facts §4) |
| `tools` (config map) | `permissions` rules (allow/deny per tool) |
| `agent` | `agents` |
| `mode` (config block) | merged into `agents` |
| `command` | `commands` |
| `mcp` command string | `mcp.<name>.command` array; oauth to snake_case; timeout split (facts §10) |
| `skills` (`{ paths, urls }`) | `skills` (string array) |
| `autoupdate` | `update` (`disable`/`notify`/`auto`) |
| `autoshare` | `share` (`manual`/`auto`/`disabled`) |
| `snapshot` | `snapshots` |
| `attachment` | `media` |
| `reference` | `references` |
| `small_model` | `agents.title.model` |
| `enabled_providers` / `disabled_providers` | `experimental` permission rules on the `provider.use` action |
| a `provider/model` model string | `{ "providerID": "...", "model": "...", "variant": "..." }` |

Dropped v1 keys (`logLevel`, `server`, `layout`) are removed as unsupported
top-level keys. Legacy `config.json` is never read in v2: report an entry
there as inert and point the consumer at `opencode.json(c)`.

Agent frontmatter is migrated, not dropped (facts §6):

| v1 frontmatter | v2 destination |
| --- | --- |
| `prompt` | `system` (the markdown body) |
| `model` + `variant` | a `{ providerID, model, variant? }` selection object |
| `temperature`, `top_p`, other provider keys | `request` (passthrough into the request body) |
| `tools` boolean map | `permissions` rules (`edit` gates write/edit/patch) |
| `permission` keyed record | `permissions` ruleset array |
| `maxSteps` | `steps` |
| `disable` | `disabled` |
| theme-name `color` | hex only |

## Phase 4 — Port plugin code (plugin engineer)

Delegate to `opencode-plugin-engineer` for every v1 plugin file. The port
target is the Effect-first v2 plugin API (facts §1, §2, §9):

- Author against `@opencode/plugin`; import `Plugin` from
  `@opencode/plugin/effect`. Default-export
  `Plugin.define({ id, effect(ctx) {...} })`; the Promise root is the
  documented fallback for trivial plugins. The `id` is load-bearing.
- Replace the returned hooks object with per-domain `transform(...)` and
  `hook(name, callback)` registrations, and the v1 `event` catch-all with
  `ctx.event.subscribe()` (facts §9). Cite the hook-family map instead of
  restating each signature.
- Replace the v1 custom-tool helper with `ctx.tool.transform` +
  `editor.add(...)` (facts §8).
- Declare `exports["./server"]` in any distributed package (facts §7, §13
  row 9). Consumer-facing versions resolve `@latest`, never pinned
  (facts §15).
- Preserve the startup non-interference invariant: hooks never throw
  (facts §2, §7).

## Phase 5 — Port v1 tool files (tool builder)

Delegate to `opencode-tool-builder` for every v1 file-based tool file (v1
`.opencode/tools/*.ts`). v1 file-based tool definitions have no v2
equivalent: map each to a plugin-registered tool via `ctx.tool.transform`,
with `input` as raw JSON Schema, an Effect codec, or a Standard Schema
validator (facts §8). The v1 `tool.schema` helper style is gone. Tools live
in the plugin package, not as standalone files.

## Phase 6 — Recommendations report

Finish with a report that tells the consumer what v2 buys them beyond
parity. Enumerate at least these, each with a one-line rationale and a
pointer to the fact:

- **Richer session hooks** — per-request-kind hooks for context, compaction,
  generate, and title, plus retry and native HTTP/WebSocket hooks (facts §9).
- **Plugin RPC** — `ctx.rpc.register` contracts with an optional `./rpc`
  export for typed client calls (facts §11).
- **TUI plugins** — a `./tui` export with Solid helpers for terminal UI
  extensions (facts §11).
- **MCP Code Mode** — `codemode` on local and remote MCP server config, and
  per-tool Code Mode exposure (facts §8, §10).
- **Saved approvals** — persisted permission approvals with
  `PermissionSaved.Info` and `Request.save` (facts §4).

## Report format

Write one report with these sections:

1. **Inventory** — every extension found, type, path, v1 or v2.
2. **No-op or changes** — "clean no-op" and why, or the list of rewrites.
3. **Skipped** — consumer-modified files skipped by hash mismatch, with the
   warning text (empty when none).
4. **Recommendations** — the v2 capabilities worth adopting.
5. **App installation** — state explicitly that the OpenCode application
   installation was not touched.

## References

- The suite's verified-facts record (`opencode-v2-facts.md`) — the source of
  truth behind every "facts §n" citation above (maintainer copy).
- The suite's bundled v2 fundamentals: `references/config.md`,
  `references/plugins.md`, `references/tools.md`, `references/agents.md`.
- `references/conformance-checklist.md` — the v2 conformance rubric to
  check the upgraded package against.
