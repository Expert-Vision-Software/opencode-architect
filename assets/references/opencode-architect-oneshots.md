# OpenCode Architect One-Shot Examples

Reference examples for routing decisions. Each shows: request → analysis → agent selection → execution order.

---

## Example 1: Test Baselining Plugin

**User Request:**
> Scaffold a plugin with skill "test-baselining" and command "test-baseline" that takes args init|eval|update. Generalize from example files.

**Analysis:**
- Skill creation → `opencode-skill-creator`
- Command with argument handling → `opencode-command-crafter`
- npm package for distribution → `opencode-packager`

**Execution:**
1. Parallel: `opencode-skill-creator` (SKILL.md + XML template)
2. Parallel: `opencode-command-crafter` (command with `$1` placeholder)
3. Sequential: `opencode-packager` (package.json + README)

---

## Example 2: MCP Server Integration

**User Request:**
> Add a custom MCP server "my-company-tools" with 5 tools. Scope tools so only the "build" agent can access "deploy-*" tools.

**Analysis:**
- MCP server configuration → `opencode-mcp-integrator`
- No skill/command/tool creation needed
- Tool scoping is MCP configuration, not custom tool building

**Execution:**
1. Single: `opencode-mcp-integrator` - configure server in opencode.json with permission rules

**Config produced** (disable the tools globally, enable them for `build` only):
```json
{
  "mcp": {
    "my-company-tools": {
      "type": "local",
      "command": ["npx", "-y", "@my-company/mcp-server"]
    }
  },
  "tools": { "deploy-*": false },
  "agent": {
    "build": {
      "tools": { "deploy-*": true }
    }
  }
}
```

---

## Example 3: Commit Message Validator Tool

**User Request:**
> Create a custom tool "validate-commit" that checks commit messages follow conventional commits format. It should work in the current git repo.

**Analysis:**
- Custom tool with schema + execute logic → `opencode-tool-builder`
- Not a skill (no SKILL.md)
- Not a command (needs to be callable by agents as a tool)
- Not MCP (local tool, not external server)

**Execution:**
1. Single: `opencode-tool-builder` - create plugin with tool definition

**Tool structure:**
```typescript
// .opencode/plugins/commit-validator.ts
import { tool } from "@opencode-ai/plugin"

export const CommitValidatorPlugin = async (ctx) => {
  return {
    tool: {
      "validate-commit": tool({
        description: "Validate commit message follows conventional commits",
        args: {
          message: tool.schema.string().describe("Commit message to validate")
        },
        async execute(args, context) {
          const pattern = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?:\s.+/
          const valid = pattern.test(args.message)
          return { valid, message: args.message }
        }
      })
    }
  }
}
```

---

## Example 4: Code Review Agent

**User Request:**
> Create a "pr-reviewer" agent that reviews pull requests. It should have access to github tools but not bash or write tools. Load the "git-release" skill automatically.

**Analysis:**
- Agent definition with permissions → `opencode-agent-designer`
- Needs specific tool allowlist/denylist
- Skill pre-loading configuration
- Not creating a skill, just referencing existing one

**Execution:**
1. Single: `opencode-agent-designer` - create agent frontmatter

**Agent structure** (`.opencode/agents/pr-reviewer.md`; the filename becomes the agent name):
```markdown
---
description: Review pull requests with security and quality focus
mode: subagent
model: anthropic/claude-sonnet-4-5
permission:
  bash: deny
  edit: deny
  "github_*": allow
  skill:
    "git-release": allow
---

## Role
Review PRs for code quality, security vulnerabilities, and test coverage.

## Workflow
1. Fetch PR diff using github tools
2. Analyze changes for patterns and issues
3. Provide structured feedback
```

`read`/`grep`/`glob` need no entry (tools are enabled by default); `edit` denies `write` and `apply_patch` too.

---

## Example 5: Multi-Component Plugin Package

**User Request:**
> Create a distributable package "opencode-devtools" that includes: a skill "debug-workflow", a command "/debug" that loads the skill, and a plugin that auto-injects environment variables.

**Analysis:**
- Skill creation → `opencode-skill-creator`
- Command creation → `opencode-command-crafter`
- Plugin with hooks → `opencode-plugin-engineer`
- Package bundling → `opencode-packager`

**Execution:**
1. Parallel: `opencode-skill-creator` (debug-workflow SKILL.md)
2. Parallel: `opencode-command-crafter` (debug.md command)
3. Parallel: `opencode-plugin-engineer` (env-inject plugin)
4. Sequential: `opencode-packager` (package all into distributable)

**Package structure:**
```
opencode-devtools/
├── package.json
├── .opencode/
│   ├── skills/debug-workflow/SKILL.md
│   ├── commands/debug.md
│   └── plugins/env-inject.ts
```

---

## Example 6: Local-Only Session Notification Plugin (plugin-engineer)

**User Request:**
> Create a plugin that sends a desktop notification when a session completes or errors. This is for my local machine only, not for publishing.

**Analysis:**
- Plugin with event hooks → `opencode-plugin-engineer`
- Local machine only, single plugin file → `opencode-plugin-engineer` (distribution intent is the packager test; see the table below)

**Execution:**
1. Single: `opencode-plugin-engineer` - create local plugin with event hooks

**Plugin structure:**
```typescript
// .opencode/plugins/session-notify.ts
import type { Plugin } from "@opencode-ai/plugin"

export const SessionNotifyPlugin: Plugin = async ({ $ }) => {
  return {
    "session.idle": async () => {
      await $`osascript -e 'display notification "Session complete" with title "OpenCode"'`
    },
    "session.error": async ({ event }) => {
      await $`osascript -e 'display notification "Session error" with title "OpenCode"'`
    }
  }
}
```

**Key distinction:**
| Use `plugin-engineer` when...        | Use `packager` when...              |
| ------------------------------------ | ----------------------------------- |
| Local-only plugin                    | Local package for sharing          |
| Event hooks / behavior modification  | Bundling skills + commands as assets|
| Single `.ts`/`.js` file              | Full package structure with package.json |
| Single-machine use                   | Local file:// sharing across projects |

---

## Example 7: Plugin with Embedded Static Instructions (plugin-engineer)

**User Request:**
> Create a customer support plugin that injects a "support-agent" prompt into sessions. The prompt should be embedded in the plugin file itself, not as separate files.

**Analysis:**
- Prompt embedded as a string literal in the plugin file, managed programmatically at runtime → `opencode-plugin-engineer`

**Execution:**
1. Single: `opencode-plugin-engineer` - create plugin with embedded prompt string

**Plugin structure:**
```typescript
// .opencode/plugins/support-agent.ts
import type { Plugin } from "@opencode-ai/plugin"

const SUPPORT_AGENT_PROMPT = `
You are a customer support agent for Acme Corp.

## Guidelines
- Be empathetic and professional
- Escalate technical issues to engineering
- Never share internal policies with customers

## Response Format
1. Acknowledge the issue
2. Provide solution or next steps
3. Offer additional help
`

export const SupportAgentPlugin: Plugin = async ({ client }) => {
  return {
    "session.created": async ({ event }) => {
      await client.context.inject(SUPPORT_AGENT_PROMPT)
    }
  }
}
```

**Key distinction from packager:**

| Use `plugin-engineer` when...                    | Use `packager` when...            |
| ------------------------------------------------ | ---------------------------------- |
| Instructions embedded as string in code          | Separate `.md` files as assets     |
| Content generated programmatically               | Static markdown files to distribute|
| Single file contains logic + content             | Package structure with multiple files |

---

## Example 8: Extract Quality Baseline Pattern

**User Request:**
> I've built a quality baseline check in my project that runs lint, tests, and coverage on every commit. I want to extract this into a reusable skill I can use across all my projects.

**Analysis:**
- Extraction workflow: analyze existing pattern → generalize → package
- Existing pattern in .opencode/ → `opencode-extension-auditor`
- Generalize into skill → `opencode-skill-creator`
- Package for local sharing → `opencode-packager`

**Execution:**
1. Sequential: `opencode-extension-auditor` (analyze what exists in .opencode/)
2. Sequential: `opencode-skill-creator` (generalize into a skill)
3. Ask: "Would you like to package this for local sharing across projects?"
4. If yes, Sequential: `opencode-packager` (create distributable package)

---

## Example 9: Extract and Publish MCP Toolset

**User Request:**
> I created some MCP tools in my company's internal repo. I want to extract them, package them as a local package, and eventually publish to our org's npm.

**Analysis:**
- Extraction + packaging + publishing pipeline
- MCP tools already configured → audit the MCP setup
- Extract tools into a plugin package → `opencode-packager`
- Publish to org npm → `opencode-publisher`

**Execution:**
1. Sequential: `opencode-extension-auditor` (analyze MCP server configuration and tools)
2. Sequential: `opencode-plugin-engineer` (if MCP tools need refactoring into a proper plugin)
3. Sequential: `opencode-packager` (package for local sharing first)
4. Ask: "Package ready. Publish to npm?"
5. If yes, Sequential: `opencode-publisher` (transform and publish)
