TEMPLATE INSTRUCTIONS
=====================
Replace the following placeholders before use:

NAME
  "myextension"  → your skill identifier (defaults to the folder-derived id
                   when omitted, but naming it explicitly is the house rule)

DESCRIPTION
  "Use this skill when the user asks about..." → your skill description
                   (required for authoring — selection quality depends on it)

OPTIONAL
  disable-model-invocation: "true" → add only when the skill must never be
                   auto-invoked by the model (maps to v2 `autoinvoke`)

Do not add v1 frontmatter fields: `license`, `compatibility`, and free-form
`metadata` are dropped by the v2 skill loader — they are not carried into the
skill record (per opencode-v2-facts §12). Every frontmatter property value is
enclosed in double quotation marks.

---
---
name: "myextension"
description: "Use this skill when the user asks about..."
---

## Activation Triggers

**USE this skill when user asks about:**
- Category: "Example query"

**Route elsewhere when:**
- The topic is non-technical
- The repo is well-known and already documented

## Workflow Summary

<workflow>
<phase name="detect">Check available tools</phase>
<phase name="search">Execute search</phase>
<phase name="query">Query sources</phase>
<phase name="synthesize">Return answer</phase>
</workflow>
