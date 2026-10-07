# OpenCode v1 → v2 upgrade report — acme-toolkit

Produced by running the `opencode-v2-upgrade` skill against the sibling
`v1-extension-package` fixture.

## Inventory

| Extension | Type | State after upgrade |
| --- | --- | --- |
| notify | plugin | Effect-first `Plugin.define({ id, effect })`; event stream + tool hook + registered tool |
| validate-commit | tool | plugin-registered tool with a JSON Schema `input` |
| pr-reviewer | agent | v2 frontmatter: selection model, `request`, `steps`, `disabled`, `permissions` |
| release-notes | skill | v2 frontmatter; v1 `license`/`metadata` dropped |
| review | command | unchanged (already v2-valid) |
| config | config | rewritten to v2-native keys |

## Changes

- Config: singular `plugin` → `plugins`; keyed `permission` and `tools` → the
  `permissions` ruleset array (`bash` → `shell`); `agent` → `agents`;
  `command` → `commands`; `autoupdate` → `update`; `small_model` →
  `agents.title.model`; MCP command string → `command` array; `skills`
  object → a `skills` string array.
- Plugin code ported to the Effect-first v2 API (returned hooks object →
  context-domain transforms and the event stream; v1 tool helper →
  `ctx.tool.transform`).
- V1 file-based tool file ported to a plugin-registered tool.

## Skipped

None. No manifest hash mismatch was found, so nothing was skipped. (On a
project with an install manifest, a mismatch would be listed here and
skipped with a warning instead of clobbered.)

## Recommendations

- Richer session hooks: `session.hook("context")`, `"compaction"`,
  `"retry"`, and native HTTP/WebSocket hooks.
- Plugin RPC via `ctx.rpc.register` with a `./rpc` export.
- TUI plugins via a `./tui` export with Solid helpers.
- MCP Code Mode via `codemode` on the server and per-tool `options`.
- Saved approvals via `PermissionSaved.Info` / `Request.save`.

## App installation

The OpenCode application installation was not touched: no binary, global
cache, or npm package change. Only the project was rewritten.

## Re-run safety

Re-running the upgrade against this tree is a clean no-op: the inventory
finds no v1 remnant. Consumer-modified files would be skipped with a
warning, never clobbered.
