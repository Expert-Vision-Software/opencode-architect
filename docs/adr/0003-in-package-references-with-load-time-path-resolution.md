# In-package references with load-time path resolution

Stable OpenCode fundamentals are no longer fetched or cached at runtime. The
package ships them as static markdown under `assets/references/`, and agent
prompts address those files with paths relative to the agent markdown file's
own directory (for example `../references/agents.md` from
`assets/agents/opencode-architect.md`). At load time the plugin detects every
backtick-quoted relative reference in a prompt — tolerating both forward and
backslash separators — and rewrites it to an absolute path resolved against
the agent file's directory, so a running agent always receives a resolvable
location regardless of where the package is installed.

Deeper or fast-moving knowledge is not vendored. Agents query the deepwiki MCP
tools against the `anomalyco/opencode` repository when that server is
available, fall back to `npx defuddle <url>` to extract a specific page, and
degrade gracefully — answering from bundled references and their own
knowledge — when neither is reachable.

## Consequences

- The package is self-contained: no startup network dependency, no user-level
  cache to create, relocate, or repair.
- Fundamentals can drift slightly behind opencode.ai; that staleness risk is
  accepted in exchange for determinism.
- Prompt authors follow one convention — relative-to-file paths with forward
  slashes — while the resolver stays tolerant of backslash separators.
- Live or niche questions depend on deepwiki/defuddle availability, so agent
  prompts must instruct graceful degradation rather than hard failure.

Supersedes 0002 (runtime docs sync into a user-level cache).
