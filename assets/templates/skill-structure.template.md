TEMPLATE INSTRUCTIONS
====================
Replace the following placeholders before use:

EXTENSION NAME
  "myextension"  → your extension identifier

VERSION
  "1.0.0"        → initial version

TOPICS
  "topic1"       → your skill topics
  "topic2"

DESCRIPTION
  "Use this skill when the user asks about..." → your skill description

---
---
name: myextension
description: Use this skill when the user asks about...
license: MIT
compatibility: opencode
metadata:
  version: 1.0.0
  audience: agents
  topic: "topic1, topic2"
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