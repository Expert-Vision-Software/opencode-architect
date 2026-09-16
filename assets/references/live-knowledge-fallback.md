# Live knowledge fallback

Shared procedure for answering questions beyond the bundled references (SDK features, new opencode APIs, config fields not covered locally).

1. **DeepWiki first.** Query the deepwiki MCP tools (`read_wiki_structure`, `read_wiki_contents`, `ask_question`) against repo `anomalyco/opencode` when available.
2. **Raw fetch second.** If deepwiki is unavailable or the target repo is not indexed, run `npx defuddle <url>` on the relevant opencode.ai/docs page (or fetch raw files from the GitHub repo) to extract content.
3. **Degrade gracefully.** When neither source is available, rely on the bundled references and your own knowledge - never block on live lookups; state clearly when an answer is unverified.

Primary agents pass this instruction to subagents in delegation prompts when the subagent's task may need live lookups.
