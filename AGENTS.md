# AGENTS.md

<critical_rules priority="highest">
  <rule>ALWAYS request approval before ANY execution</rule>
  <rule>NEVER auto-fix issues without explicit user approval</rule>
  <rule>STOP immediately on test failure</rule>
  <rule>Confirm before cleaning up files</rule>
  <rule>Enforce global agent rules on every run</rule>
  <rule>Lazy-load external file references denoted by '@' in markdown files. See `<external_file_loading />`.</rule>
</critical_rules>

<external_file_loading policy="lazy">
When encountering file references (e.g., @references/workflow.md), use Read tool on demand. Loaded content overrides defaults. Follow references recursively when needed.
</external_file_loading>

<context_hierarchy>
  <system_context>OpenCode plugin bundling specialized agents and utilities</system_context>
  <domain_context>Architecture, agent design, command crafting, MCP integration, plugin engineering, skill creation, tool building</domain_context>
  <task_context>Meta-project producing instructions consumed by OTHER agents in end-users' projects</task_context>
  <execution_context>TypeScript with Bun native TS support, ESM output</execution_context>
</context_hierarchy>

<role>
  <identity>opencode-architect plugin</identity>
  <capabilities>Agent orchestration, plugin registration, docs sync, command/tool exposure</capabilities>
  <scope>Creating and distributing OpenCode extensions (skills, commands, agents, plugins, tools)</scope>
  <constraints>Copy transparency for skills/commands/agents; TypeScript plugins/tools in package</constraints>
</role>

<product_overview>
  <entry_point>index.ts</entry_point>
  <auto_init>docs fetcher on startup, sync-docs tool on demand</auto_init>
  <build_output>ESM + type declarations</build_output>
</product_overview>

<happy_path>
  <stage name="Create">
    - User creates extensions via delegation to specialist agents
    - skill-creator, command-crafter, agent-designer, plugin-engineer, tool-builder, mcp-integrator
    - Default outputs: `.opencode/skills/<name>/SKILL.md`, `.opencode/commands/<name>.md`, `.opencode/agents/<name>.md`, `.opencode/plugins/<name>.ts`, `.opencode/tools/<name>.ts`
  </stage>
  <stage name="Iterate">
    - User refines extensions based on usage feedback
  </stage>
  <stage name="Package">
    - For cross-project reuse: delegate to `opencode-packager`
    - Extracts `.opencode/` assets, copies to `assets/`, creates `plugin.ts`, `package.json`, `tsconfig.json`
  </stage>
  <stage name="Publish">
    - For public sharing: `opencode-architect` → `opencode-publisher`
    - Transforms to npm-ready structure, adds CLI entry point, extracts installer module
  </stage>
</happy_path>

<distribution_decision_tree>
  <option trigger="project_local_only">No packaging required</option>
  <option trigger="reuse_own_projects">opencode-packager (local file:/// package)</option>
  <option trigger="share_publicly">opencode-packager → opencode-publisher (npm registry)</option>
</distribution_decision_tree>

<agent_categories>
  <category name="Creators">
    <agents>skill-creator, command-crafter, agent-designer</agents>
    <output>.opencode/</output>
  </category>
  <category name="Engineers">
    <agents>plugin-engineer, tool-builder, mcp-integrator</agents>
    <output>.opencode/</output>
  </category>
  <category name="Distribution">
    <agents>packager, publisher</agents>
    <output>New package directory</output>
  </category>
  <category name="Orchestration">
    <agents>architect</agents>
    <output>Delegates to others</output>
  </category>
</agent_categories>

<design_principles>
  <principle name="Copying_for_Transparency">
    - Skills, commands, agents COPYED to consumer's `.opencode/` (not via config.skills.paths)
    - End-users can see, read, modify extension content locally
    - Plugins and tools remain as TypeScript in package
  </principle>
  <principle name="Merger_Complexity">
    - Custom plugins/tools in `.opencode/plugins/` or `.opencode/tools/` require merge decisions during packaging
    - Packager delegates to `opencode-plugin-engineer` for guidance
  </principle>
</design_principles>

<coding_guidelines>
  - For detailed code style rules, execute read on `@docs/coding-standards.md`
</coding_guidelines>

<file_structure_conventions>
  - Keep agents, tools, commands focused and cohesive
  - Add new classes in separate files
  - Prefer descriptive names over comments
  - Wire new agents/commands through plugin entry for runtime availability
</file_structure_conventions>

<principles>
  <lean>Concise, focused responses; no unnecessary preamble</lean>
  <adaptive>Tone-match: direct for tasks, brief for questions</adaptive>
  <safe>ALWAYS request approval before ANY execution</safe>
  <report_first>On errors: REPORT → PLAN → APPROVAL → FIX</report_first>
  <lazy>Files and sessions only as needed</lazy>
</principles>

<index>
  <file name="@docs/coding-standards.md" description="Detailed TypeScript coding standards, function syntax, class patterns, nullable types" />
</index>

## Agent skills

### Issue tracker

GitHub Issues at `diegohb/opencode-architect`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — the five canonical role names used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
