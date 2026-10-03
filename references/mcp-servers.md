# OpenCode MCP servers — fundamentals

MCP (Model Context Protocol) servers add external tools alongside built-ins. Configure them under the `mcp` key in `opencode.json` with a unique name per server.

Caution: MCP tools add to context — enable only what you need.

## Local servers

```json
{
  "mcp": {
    "my-local-mcp": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],
      "enabled": true,
      "environment": { "MY_ENV_VAR": "value" }
    }
  }
}
```

Options: `type` (required, `"local"`), `command` (required array), `cwd`, `environment`, `enabled`, `timeout` (ms to fetch tools, default 5000).

## Remote servers

```json
{
  "mcp": {
    "my-remote-mcp": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "enabled": true,
      "headers": { "Authorization": "Bearer {env:MY_API_KEY}" }
    }
  }
}
```

Options: `type` (required, `"remote"`), `url` (required), `headers`, `oauth`, `enabled`, `timeout`.

## OAuth (remote)

- Automatic: OpenCode detects the 401, runs the OAuth flow (dynamic client registration, RFC 7591), and stores tokens. No config needed for most servers.
- Pre-registered credentials: `"oauth": { "clientId": "...", "clientSecret": "...", "scope": "tools:read" }` (use `{env:VAR}` for secrets).
- `"oauth": false` disables auto-OAuth (e.g. API-key servers).
- CLI: `opencode mcp auth <name>`, `opencode mcp list`, `opencode mcp logout <name>`, `opencode mcp debug <name>`.

## Tool scoping

MCP tools register as `<servername>_<toolname>`, so glob patterns control them like any tool:

- Disable globally: `"tools": { "my-mcp*": false }` or via permission `"my-mcp_*": "ask"` (permission patterns match built-ins, custom tools, and MCP tools alike).
- Enable per agent only: disable globally in `tools`, then set `"tools": { "my-mcp*": true }` inside the agent's config.
- Glob syntax: `*` (any chars), `?` (one char); last matching permission rule wins.
- Per-server enable/disable: `"enabled": false` on the server entry hides all its tools without deleting config.
