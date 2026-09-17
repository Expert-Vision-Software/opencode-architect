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
The agent that inventories a project's `.opencode/` directory and assesses
packaging readiness, and that reviews built packages for conformance to this
suite's design.
_Avoid_: analyzer

**Conformance review**:
The auditor's verdict-bearing assessment of a built package against the
suite's design rubric: install mechanics, config safety, scope discipline,
frontmatter hygiene. Pass, latent, or fail per item. Distinct from an
inventory: it judges a distributed package, not a project's `.opencode/`.

**Discovery study**:
The read-only comparative research the packager delegates when shaping a new
package from example repos. Informs content and naming only; never
structure.

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

### Installation

**Scope base**:
The root an install writes into: the project's `.opencode/` (local scope) or
`~/.config/opencode/` (global scope).

**Plugin install**:
The mode where the consumer lists the package in `opencode.json`'s plugin
array; agents register from the package at load time and nothing is copied.
Always-fresh, not user-editable.

**Copy install**:
The mode where the CLI copies agents into the scope base's `agents/` and
references into `opencode-architect/references/`, leaving visible, editable
files. Mutually exclusive with plugin install in the same scope.

**Payload**:
What a copy install places in the consumer's project: the ten agent markdown
files plus the bundled references and templates.

**Manifest**:
The JSON file an install writes at the scope base, recording the installed
version, the installed files, and their per-file content hashes; source of
truth for status, no-op detection, and uninstall. The suite's own copy
install and every generated package keep one (a generated package's lives at
`<scope base>/<package>.manifest.json`).

**Registration scope**:
Where a package is actually registered, detected read-only from config
files: none, global, repo-local, or both. Detection never writes and never
keys off the launch directory. Determines which scopes a load-time
installation may touch.
_Avoid_: scope (ambiguous with the scope base, which is a write target)

**Load-time installation**:
The plugin hook that ensures a package's assets in the registered scopes
when OpenCode starts. Manifest-gated; never edits config registrations;
never writes outside the detected registration scopes.
_Avoid_: auto-install, install on load

**Zero-write no-op**:
The state where a running package version matches its scope's manifest and
every file hash matches, so a start performs no writes at all.

**Consumer modification**:
An installed file the consumer edited after install, detected by hash
mismatch against the manifest. Upgrades skip modified files with a warning;
taking ownership of them is CLI-only with an explicit force flag.

**Install-time reference resolution**:
The one-time rewriting of backticked relative reference paths in agent
prompts into absolute paths inside the installed references and templates
directories; the copy-install counterpart of reference resolution.

### Bundled files

**References**:
The static markdown guides bundled with the package at `assets/references/`,
covering stable OpenCode fundamentals.

**Templates**:
The static scaffolding files bundled with the package at `assets/templates/`,
from which the packager and publisher render a generated package's code
files (plugin entry, manifest, name normalizer, registration detector, CLI,
installer). The structural source of truth for generated packages: example
repos may lag the corrected install pattern. Consumed at package-build
time, unlike references, which agents read for knowledge.

**Reference resolution**:
The load-time rewriting of backtick-quoted relative paths in agent prompts —
authored relative to the agent markdown file's own directory — into absolute
paths pointing inside the package.
