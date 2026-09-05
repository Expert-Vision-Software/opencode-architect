# opencode-architect

A meta-project: an OpenCode plugin whose specialist agents design and build
OpenCode extensions (skills, commands, agents, plugins, tools) in end-users'
projects.

## Language

### The plugin and its pieces

**Extension**:
Any OpenCode artifact built for use in a project: a skill, command, agent,
plugin, or tool.
_Avoid_: artifact

**Agent**:
One of the ten bundled specialist subagents, each named `opencode-*` and
defined as markdown with YAML frontmatter.
_Avoid_: assistant

**Skill**:
An extension defined by a SKILL.md (frontmatter: name, description) that
OpenCode discovers by scanning for `**/SKILL.md`.

**Command**:
A user-invoked slash command defined as markdown with a prompt template.
Distinct from a tool: the user triggers it, not an agent.

**Tool**:
A function with a typed schema and execute logic that agents call. Distinct
from a command: agents invoke it, not the user.

**Plugin**:
A TypeScript module registering config, tools, and event hooks with OpenCode.
_Avoid_: extension (a plugin is one kind of extension)

### The suite

**Architect**:
The orchestrator agent. Analyzes requests and delegates to specialists; never
implements anything itself.
_Avoid_: orchestrator, router

**Creators**:
The agents that author project-local extension files: skill-creator,
command-crafter, agent-designer.

**Engineers**:
The agents that build code-backed pieces: plugin-engineer, tool-builder,
mcp-integrator.

**Extension auditor**:
The agent that analyzes a project's `.opencode/` directory to inventory
extensions and assess packaging readiness.

**Packager**:
The agent that bundles extensions into a locally-shareable package.

**Publisher**:
The agent that transforms a local package into an npm-ready package and
publishes it.

**One-shots**:
The reference routing examples (request → analysis → agent selection →
execution order) the architect reads before delegating.

### Distribution

**Consumer**:
The developer and project that install a distributed package.
_Avoid_: end user

**Package**:
The distributable unit (`opencode-<name>/`) holding assets, a plugin entry,
and a package manifest. Contains extensions; is not itself one.
_Avoid_: extension

**Assets**:
The static files bundled in a package (agent markdown, templates, references)
that get copied into the consumer's `.opencode/`.

**Distribution target**:
Where an extension is headed: project-local only, local sharing (`file:///`),
or public npm.

**Extraction**:
Generalizing a project-specific pattern into a reusable extension:
auditor analyzes, creators generalize, packager optionally bundles.

**Merge decision**:
The user choice required when custom plugins or tools are found in `.opencode/`
during packaging; guided by the plugin engineer.

### Docs sync

**Docs cache**:
The user-level mirror of OpenCode documentation that all agents cite,
at `~/.cache/opencode/opencode-architect/docs`.

**Docs sync**:
Fetching the latest docs from opencode.ai into the docs cache — on startup,
and on demand via the sync-docs command and tool.
