---
description: "Review pull requests for quality and security"
mode: "subagent"
model:
  providerID: "anthropic"
  model: "claude-sonnet-4-5"
request:
  temperature: 0.2
steps: 25
disabled: false
permissions:
  - { action: "read", resource: "*", effect: "allow" }
  - { action: "edit", resource: "*", effect: "deny" }
  - { action: "shell", resource: "*", effect: "deny" }
---

Review the pull request and report structured findings.
