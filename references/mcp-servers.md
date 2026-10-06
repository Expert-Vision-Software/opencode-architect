# OpenCode MCP servers — fundamentals

MCP (Model Context Protocol) servers add external tools alongside built-ins.
Configure them under the `mcp` key in `opencode.json` — a map of unique name
→ server config. Caution: MCP tools add to context — enable only what you
need. Facts per `docs/reference/opencode-v2-facts.md` §10 (config shapes,
plugin surface), §5 (config key).

v1→v2 reshaping to remember: the local `command` is an **array**
(a single string no longer works); OAuth keys are **snake_case**
(`client_id`, `client_secret`); the single millisecond `timeout` split into
`{ startup, catalog, execution }`. Facts §10.

## Local servers

```json
{
  "mcp": {
    "my-local-mcp": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],
      "environment": { "MY_ENV_VAR": "value" }
    }
  }
}
```

Local options: `type` (`"local"`), `command` (required array), `cwd`,
`environment`, `disabled`, `codemode`,
`timeout: { "startup", "catalog", "execution" }`,
`protocol` (`"legacy"`, `"auto"`, or `"2026-07-28"`). Facts §10.

## Remote servers

```json
{
  "mcp": {
    "my-remote-mcp": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

Remote options: `type` (`"remote"`), `url` (required), `headers`, `oauth`,
`disabled`, `codemode`, `timeout`, `protocol`. Facts §10.

## OAuth (remote)

- Pre-registered credentials (snake_case):
  `"oauth": { "client_id": "...", "client_secret": "...", "scope":
  "tools:read" }`, plus optional `callback_port`, `redirect_uri`,
  `auth_server_metadata_url`.
- `"oauth": false` disables OAuth handling for the server.
- Automatic flow detection and the v1 `opencode mcp auth` CLI: pending
  verification — not adjudicated in opencode-v2-facts.

## Tool scoping

- Per-server disable: `"disabled": true` on the server entry (v2 replaces
  the v1 `enabled` flag) — hides all its tools without deleting config.
  Facts §10.
- Plugins reconcile servers via `ctx.mcp.transform` (`list/get/set/update/
  remove`); setting `disabled` toggles reconciliation; `reload()` reapplies.
  Facts §10.
- Permission rules can name MCP-derived tools like any other action (the
  action vocabulary is an open string of tool names, facts §4); the exact
  `<server>_<tool>` naming of MCP-derived actions: pending verification.
