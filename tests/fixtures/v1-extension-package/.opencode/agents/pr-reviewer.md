---
description: "Review pull requests for quality and security"
mode: "subagent"
model: "anthropic/claude-sonnet-4-5"
temperature: 0.2
maxSteps: 25
disable: false
prompt: "You review pull requests for correctness, security, and missing tests."
tools:
  write: false
  edit: false
  bash: false
  read: true
---

Review the pull request and report structured findings.
