---
description: "Upgrade this project's OpenCode extensions to v2 — inventory, plugin and tool port, config rewrite, and a v2 recommendations report"
---

Act as `opencode-architect` and run the suite's one-shot OpenCode v1 → v2
upgrade for this project. Load and follow the `opencode-v2-upgrade` skill end
to end: inventory the extensions, port every v1 plugin file to the
Effect-first v2 plugin API, port v1 file-based tool files to plugin-registered
tools, rewrite the configs to v2-native keys per the verified mapping, and
finish with the v2 capability recommendations report.

Honor the skill's safety contract: no-op on an already-v2 project, skip
consumer-modified files with a warning, and never touch the OpenCode
application installation.

$ARGUMENTS
