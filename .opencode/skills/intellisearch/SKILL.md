---
name: intellisearch
description: Find, search, or discover JavaScript/TypeScript libraries, frameworks, packages, or GitHub repositories — comparisons, alternatives, setup choices, code examples. Loads for queries like 'find N solutions', 'search for libraries', 'discover repositories'.
license: MIT
compatibility: opencode
metadata:
  version: 0.5.1
  audience: agents
  topic: [github-discovery, api-reference, code-patterns, library-comparison]
  usage_tips: Best used after a failed local search. Combines repo-finding with DeepWiki deep-querying.
---

<critical_rules priority="highest">
<rule>Ground library and repo claims in a live search — training-data knowledge of libraries goes stale</rule>
<rule>Query repositories through DeepWiki; raw github.com pages render poorly</rule>
</critical_rules>

## External File Loading

Load a file reference (e.g., @references/workflow.md) with your Read tool when the current phase needs it. Loaded content overrides defaults. Follow nested references the same way.

## Activation Triggers

**USE this skill when the user asks about:**

<use_cases>
<case category="discovery">"Is there a TypeScript library for semver validation?" · "Which React framework handles server-side rendering?"</case>
<case category="comparisons">"Compare Next.js vs Remix for my project"</case>
<case category="alternatives">"Alternatives to Moment.js for date handling"</case>
<case category="setup">"How do I set up Tailwind with Vite?"</case>
<case category="examples">"Show me how to implement rate limiting in Express"</case>
<case category="troubleshooting">"Why am I getting CORS errors with Axios?"</case>
<case category="features">"Does Prisma support composite keys?"</case>
</use_cases>

**Key indicators:** Technology names mentioned (React, TypeScript, npm), asking for recommendations or implementation guidance, or a need for current, authoritative documentation.

**DO NOT USE for:**

<non_use_cases>
<case>Stable knowledge ("What is REST?", "What's the syntax for arrow functions?") → answer directly</case>
<case>Off-topic or non-technical ("What's the weather?", "How do I cook pasta?") → irrelevant</case>
<case>User's own code ("Debug my script") → use code analysis tools directly</case>
<case>Known specific repo ("Tell me about facebook/react") → use DeepWiki directly</case>
<case>Current events/news ("What happened to NPM yesterday?") → use web search</case>
<case>Private/internal repos ("Search my company's private repo") → DeepWiki can't access</case>
<case>Opinion questions ("Is React better than Vue?") → no factual repo answer</case>
</non_use_cases>

## Workflow Summary

<workflow>
<phase name="detect">Check available tools in reliability order: gh CLI → search tool → fetch tool; use the highest one available</phase>
<phase name="search">Execute search using highest priority available tool</phase>
<phase name="filter">Select top 3 repos by stars, recency, language match</phase>
<phase name="query">Query DeepWiki with repos (multi-repo first, fallback to individual)</phase>
<phase name="synthesize">Return answer with trade-offs, implementation guidance, links</phase>
</workflow>

## References

**Read immediately:**
- @references/examples.md - Few-shot examples (library discovery, comparison, fallback)
- @references/workflow.md - Pipeline phases, decision matrix, failure handling
- @references/search-workflow.md - Tool detection, URI cycling

**Load on-demand:**
- @references/gh-cli.md - GitHub CLI search syntax
- @references/deepwiki-tools.md - DeepWiki usage, blocked paths, validation
- @references/google-search.md - Google operators
- @references/brave-search.md - Brave operators
- @references/ddg-search.md - DuckDuckGo operators
