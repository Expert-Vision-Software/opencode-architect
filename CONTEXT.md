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
authored as markdown with YAML frontmatter — the authoring format regardless
of how a package deploys. A package shipping agents is code-backed.
_Avoid_: assistant

**Skill**:
An extension defined by a SKILL.md (frontmatter: name, description) that
OpenCode discovers by scanning for `**/SKILL.md`.

**Command**:
A user-invoked slash command defined as markdown with a prompt template.
Distinct from a tool: the user triggers it, not an agent.

**Tool**:
A function with a typed argument schema and execute logic that agents call.
Tools are registered by plugins (see tool registration); there is no
file-based tool definition. Distinct from a command: agents invoke it, not
the user.

**Plugin**:
A package registered under the plugins config key whose entry default-exports
a plugin definition that registers agents, tools, hooks, and MCP changes
through context domains at activation.
_Avoid_: extension (a plugin is one kind of extension)

**Plugin registration key**:
The `plugins` array in `opencode.json`/`opencode.jsonc` — the config key that
registers plugin packages. Entries are package specs (`name@latest`) or
`{ package, options }` objects; `-target` entries remove. Replaces the v1
singular `plugin` key, which is tolerated read-only with an upgrade advisory.
_Avoid_: plugin key (singular), plugin array

**Plugin definition shape**:
The default-export contract for a plugin entry module: `{ id, effect }`
(Effect-first) or `{ id, setup }` (Promise fallback), with a stable `id` that
scopes storage and diagnostics. Anything else fails loading. The suite's
house style is the Effect shape.
_Avoid_: plugin factory, hooks object

**Tool registration**:
How custom tools come to exist in v2: a plugin's tool-domain transform adds
`{ name, input, description, execute }` tool definitions whose `input` is a
JSON Schema (or Effect Schema/Standard Schema codec). The v1 file-based
`.opencode/tools/` convention has no v2 equivalent.
_Avoid_: tool file, file-based tool (for new work)

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
structure and distribution. Pass, latent, or fail per item. Distinct from an
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

**Upgrade skill**:
The bundled `opencode-v2-upgrade` SKILL.md the plugin registers at load. It
defines the one-shot consumer v1→v2 upgrade: inventory, plugin and tool port,
config rewrite, and a recommendations report.
_Avoid_: migration guide (it is a procedure, not prose documentation)

**Upgrade command**:
The bundled `upgrade-opencode-v2` slash command the plugin registers at load.
It submits the upgrade prompt and attaches the upgrade skill.
_Avoid_: upgrade tool

### Distribution

**Consumer**:
The developer and project that install a distributed package.
_Avoid_: end user

**Package**:
The distributable unit (`opencode-<name>/`) holding assets, a plugin entry,
and a package manifest. Contains extensions; is not itself one.
_Avoid_: extension

**Assets**:
The static files bundled in a package (skills, commands, agent markdown,
templates, references). Skills and commands are copy-deployable; everything
else registers from the package at load.

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

**Code-backed**:
Describes a package shipping any extension kind beyond skills and commands —
agents, tools, hooks, or other plugin integrations. Code-backed packages
require plugin install; skills and commands are the only copy-deployable
extensions.

**Deployment plan**:
The install mechanism a package's content dictates, declared in the
package's package.json: assets-only packages copy-install by default with
plugin install as the opt-in; code-backed packages always plugin-install.

**Content declaration**:
The `"content"` field (`assets` or `code`) in a generated package's
package.json, derived by the packager from its asset inventory and verified
by the publisher. It is how installers read the deployment plan.

**Plugin install**:
The mode where the package is listed in a config file's `plugins` array and
everything registers from the package at load time; the CLI copies nothing.
Mandatory for code-backed packages; the always-fresh opt-in for assets-only
packages.

**Copy install**:
The mode where the CLI copies the package's copy-deployable assets (skills
and commands) into the scope base, leaving visible, editable files. The
default install for assets-only packages; mutually exclusive with plugin
install in the same scope.

**Skills market**:
The `npx skills add` consumption channel and its skills.sh listing. Two
distinct requirements compose market compatibility. **Discoverability**: the
package's skills sit at a market-findable file layout — the market tool scans
the package for directories containing a frontmatter-valid `SKILL.md`, with
`skills/<name>/` the canonical container — a property of the produced
package's structure regardless of install mode. **Install parity**: the copy
install default for assets-only packages leaves skills as visible, editable
files, matching the kind of end state the market tool produces. Code-backed
packages keep discoverability but lose install parity, which is why skill
collections split into assets-only packages.
_Avoid_: skills.sh (the listing site, not the channel)

**Payload**:
What a copy install places in the consumer's project: the package's skills
and commands.

**Manifest**:
The JSON file an install writes at the scope base, recording the installed
version, the install mode, the registration entry and its target config file
(plugin mode), and the installed files with per-file content hashes (copy
mode); source of truth for status, no-op detection, uninstall, and
migration. Every install keeps one (a generated package's lives at
`<scope base>/<package>.manifest.json`).

**Registration scope**:
Where a package is actually registered, detected read-only from config
files: none, global, repo-local, or both. Detection never writes and never
keys off the launch directory. Determines which scopes a load-time
installation may touch.
_Avoid_: scope (ambiguous with the scope base, which is a write target)

**Load-time installation**:
The plugin work at startup that ensures a package's assets in the registered
scopes when OpenCode starts. Manifest-gated; never edits config
registrations; never writes outside the detected registration scopes.
_Avoid_: auto-install, install on load

**Startup non-interference**:
The invariant that a package never blocks or aborts OpenCode's launch:
load-time failures degrade to a warning and an advisory, and only the CLI
may fail hard. A hook that throws can stall startup with no escape, so
hooks never throw.

**Partial cache artifact**:
An npm cache generation of a package left incomplete (bundled assets missing)
by an interrupted install, in OpenCode's npm plugin cache
(`<cache>/npm/<key>/<generation>`), which the host can load without repair.
Packages must detect this state at activation and advise removing the
specific cache key; it is not a consumer-setup error.

**Zero-write no-op**:
The state where the manifest matches reality — same version, file hashes
intact, registration entry already present in the `plugins` array — so an
install or start performs no writes at all.

**Consumer modification**:
An installed file the consumer edited after install, detected by hash
mismatch against the manifest. Upgrades skip modified files with a warning;
taking ownership of them is CLI-only with an explicit force flag.

### Bundled files

**References**:
The static markdown guides bundled with the package at `references/`,
covering stable OpenCode fundamentals.

**Templates**:
The static scaffolding files bundled with the package at `templates/`,
from which the packager and publisher render a generated package's code
files (plugin entry, manifest, name normalizer, registration detector, CLI,
installer). The structural source of truth for generated packages: example
repos may lag the corrected install pattern. Consumed at package-build
time, unlike references, which agents read for knowledge.

**Reference resolution**:
The load-time rewriting of backtick-quoted relative paths in agent prompts —
authored relative to the agent markdown file's own directory — into absolute
paths pointing inside the package.
