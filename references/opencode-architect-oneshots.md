# OpenCode Architect One-Shot Examples

Reference examples for routing decisions. Each shows: request → analysis →
agent selection → execution order. Code and config snippets are v2,
Effect-first — facts per `docs/reference/opencode-v2-facts.md`; where a hook
signature is not settled there, the snippet points at the domain API rather
than restating it.

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
- Tool scoping is MCP + permissions configuration, not custom tool building

**Execution:**
1. Single: `opencode-mcp-integrator` - configure server in opencode.json with permission rules

**Config produced** (deny the server's tools globally, allow them for `build`;
the exact MCP-derived action naming is pending verification — facts §4):

```json
{
  "mcp": {
    "my-company-tools": {
      "type": "local",
      "command": ["npx", "-y", "@my-company/mcp-server"]
    }
  },
  "permissions": [
    { "action": "my-company-tools_*", "resource": "*", "effect": "deny" }
  ],
  "agents": {
    "build": {
      "permissions": [
        { "action": "my-company-tools_*", "resource": "*", "effect": "allow" }
      ]
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
1. Single: `opencode-tool-builder` - create plugin with tool registration

**Plugin structure** (v2 tools are plugin-registered; facts §8):

```typescript
// .opencode/plugin/commit-validator.ts
import { Effect } from "effect"
import { Plugin } from "@opencode/plugin/effect"

export default Plugin.define({
  id: "commit-validator",
  effect: (context) =>
    context.tool.transform((editor) => {
      editor.add({
        name: "validate-commit",
        description: "Validate commit message follows conventional commits",
        input: {
          type: "object",
          properties: {
            message: { type: "string", description: "Commit message to validate" },
          },
          required: ["message"],
        },
        execute: (args) =>
          Effect.succeed({
            output: /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?:\s.+/.test(args.message)
              ? "valid"
              : "invalid",
          }),
      })
    }),
})
```

---

## Example 4: Code Review Agent

**User Request:**
> Create a "pr-reviewer" agent that reviews pull requests. It should have access to github tools but not shell or file-modification tools.

**Analysis:**
- Agent definition with permissions → `opencode-agent-designer`
- Needs specific action allowlist/denylist
- Not creating a skill, just referencing existing ones

**Execution:**
1. Single: `opencode-agent-designer` - create agent frontmatter

**Agent structure** (`.opencode/agents/pr-reviewer.md`; the filename becomes
the agent name; v2 ruleset permissions — facts §4):

```markdown
---
description: "Review pull requests with security and quality focus"
mode: "subagent"
model: { "providerID": "anthropic", "model": "claude-sonnet-4-5" }
permissions:
  - { action: "shell", resource: "*", effect: "deny" }
  - { action: "edit", resource: "*", effect: "deny" }
  - { action: "github_*", resource: "*", effect: "allow" }
---

## Role
Review PRs for code quality, security vulnerabilities, and test coverage.

## Workflow
1. Fetch PR diff using github tools
2. Analyze changes for patterns and issues
3. Provide structured feedback
```

`read`/`grep`/`glob` need no entry (allowed by the built-in defaults; facts
§3); `edit` denies `write` and `patch` too.

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
├── package.json         # declares exports["./server"] (facts §7, §14.6)
├── index.ts             # default-only entry
├── src/plugin.ts        # Effect-first plugin definition
├── skills/debug-workflow/SKILL.md
└── commands/debug.md
```

---

## Example 6: Local-Only Session Notification Plugin (plugin-engineer)

**User Request:**
> Create a plugin that sends a desktop notification when a session completes or errors. This is for my local machine only, not for publishing.

**Analysis:**
- Plugin with event handling → `opencode-plugin-engineer`
- Local machine only, single plugin file → `opencode-plugin-engineer` (distribution intent is the packager test; see the table below)

**Execution:**
1. Single: `opencode-plugin-engineer` - create local plugin with event handling

**Plugin structure** (events arrive via the `ctx.event.subscribe()` stream —
facts §9; exact event type names: pending verification):

```typescript
// .opencode/plugin/session-notify.ts
import { Effect } from "effect"
import { Plugin } from "@opencode/plugin/effect"

export default Plugin.define({
  id: "session-notify",
  effect: (context) =>
    Effect.gen(function* () {
      const events = yield* context.event.subscribe()
      for await (const event of events) {
        // Filter for session completion/error events at implementation time
        // (event type names pending verification), then notify:
        // Bun.$`osascript -e 'display notification ...'`.exitCode
      }
    }),
})
```

**Key distinction:**
| Use `plugin-engineer` when...        | Use `packager` when...              |
| ------------------------------------ | ----------------------------------- |
| Local-only plugin                    | Local package for sharing          |
| Event handling / behavior modification | Bundling skills + commands as assets|
| Single `.ts`/`.js` file              | Full package structure with package.json |
| Single-machine use                   | Local file:// sharing across projects |

---

## Example 7: Plugin with Embedded Static Instructions (plugin-engineer)

**User Request:**
> Create a customer support plugin that injects a "support-agent" prompt into sessions. The prompt should be embedded in the plugin file itself, not as separate files.

**Analysis:**
- Prompt embedded as a string literal in the plugin file, managed
  programmatically at runtime → `opencode-plugin-engineer`

**Execution:**
1. Single: `opencode-plugin-engineer` - create plugin with embedded prompt string

**Plugin structure** (session context hooks edit the request — facts §9:
`session.hook("context")`, edit `event.system`; wire the exact callback per
the `@opencode/plugin/effect` session types):

```typescript
// .opencode/plugin/support-agent.ts
import { Plugin } from "@opencode/plugin/effect"

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

export default Plugin.define({
  id: "support-agent",
  effect: (context) =>
    // session.hook("context") — edit event.system / event.messages here
    context.session.hook("context", (event) => {
      event.system = `${event.system ?? ""}\n\n${SUPPORT_AGENT_PROMPT}`.trim()
    }),
})
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
