# Prompt engineering — distilled best practices

Distilled from Anthropic's Claude prompting best practices and skill-authoring best practices. Apply to agent prompts, skill bodies, and command templates.

## Core principles

- **Be clear and direct.** State the desired output, format, and constraints explicitly. If you want above-and-beyond behavior, ask for it. The colleague test: could someone with minimal context follow your prompt?
- **Explain why.** Give context/motivation for rules ("never use ellipses because a TTS engine reads this aloud"). The model generalizes from the explanation.
- **Sequence matters.** Use numbered steps or bullets when order or completeness matters. Put critical instructions at the end of long prompts.
- **Give a role.** A one-sentence persona in the system prompt focuses tone and behavior ("You are a code reviewer focused on security...").

## Examples and structure

- Few-shot examples (3–5) are the most reliable way to steer format, tone, and structure. Make them relevant, diverse, and wrapped in tags (`<example>` inside `<examples>`).
- Use XML tags to separate instructions, context, documents, and inputs in complex prompts (`<instructions>`, `<context>`, `<documents>`). Consistent, descriptive tag names.
- Long context: put longform data near the top and the query/instructions at the end; wrap each document in `<document>` tags with metadata; ask the model to quote relevant passages before answering.

## Output control

- Say what to do, not what not to do ("write flowing prose paragraphs" beats "don't use bullets").
- Match your prompt's style to the desired output style (markdown-heavy prompts yield markdown-heavy answers).
- Use structured outputs (JSON/XML schemas) when precise parsing is needed; request verbatim structure with an explicit template.

## Tool use and agentic behavior

- Models may suggest instead of act. Be explicit: "Change this function" vs "Can you suggest changes". Prompt blocks can set a default-to-action or do-not-act bias.
- Independent tool calls can run in parallel; this is steerable ("make all independent calls in parallel" / "execute sequentially").
- Prefer general guidance over aggressive over-prompting ("Use this tool when..." beats "CRITICAL: you MUST..."). Over-instruction causes overtriggering.
- Self-check: "Before you finish, verify your answer against the criteria" catches errors; ask for it only when quality demands it.
- Guard rails for agents: confirm before irreversible or shared-system actions; avoid over-engineering (only requested changes, no speculative abstractions); investigate files before answering (never speculate about unread code); write general solutions, don't hardcode to tests.
- Subagents: use for parallelizable, context-isolated workstreams; work directly for simple sequential tasks.

## Skill and instruction authoring

- **Concise is key** — the context window is a public good. Only add context the model doesn't already have; make every paragraph justify its tokens.
- **Set degrees of freedom** to match fragility: high freedom (heuristics) for flexible tasks; low freedom (exact scripts, "do not modify this command") for fragile operations.
- **Descriptions drive selection**: third person, what it does + when to use it, with specific trigger terms. Avoid vague names (`helper`, `utils`) and vague descriptions.
- **Progressive disclosure**: overview in the main file; details in separately linked files, one level deep (nested references cause partial reads). Table of contents for files over 100 lines.
- **Workflows and feedback loops**: numbered steps with copy-paste checklists for complex tasks; validate → fix → repeat loops for quality-critical operations; create verifiable intermediate outputs before destructive or batch operations.
- **Stability**: no time-sensitive information; consistent terminology (pick one term per concept); avoid Windows-style paths — always forward slashes.
- **Provide a default, not a menu**: one recommended approach with an escape hatch for exceptions, not five equivalent options.

## Iteration

- Test with real tasks and observe how the instructions are actually navigated; iterate on observed failures, not assumptions.
- Build evaluations before extensive documentation: identify gaps, write minimal instructions to close them, measure against baseline.
