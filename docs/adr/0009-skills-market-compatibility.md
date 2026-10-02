# Skills-market compatibility for skill-bearing packages

Any package created with this suite's guidance that ships at least one skill
must remain consumable through the `npx skills add` channel, and should be
structured so it can list on skills.sh as it gains consumption. This is a
compatibility constraint on packaging, not a distribution target: the
package may also be a local `file:///` package or an npm plugin package, and
the skills inside stay market-consumable regardless.

Market compatibility composes two distinct requirements, validated against
the market CLI's source (`vercel-labs/skills`). **Discoverability** is a
property of the produced extension package's file layout only: the market
tool scans the package for directories containing a SKILL.md with valid
`name`/`description` frontmatter — priority containers such as
`skills/<name>/` are walked first, then a full recursive scan finds any
`SKILL.md` anywhere in the package — so the layout constraint binds every
skill-bearing package, code-backed or not, independent of install mode.
**Install parity** is a property of the deployed artifact: skills must end
up in the consumer's project as visible, editable files, the kind of end
state the market tool produces (it installs OpenCode skills to
`.agents/skills/`; this suite's CLI copies to `.opencode/skills/` — a
benign divergence, since both load in OpenCode).

The copy install default for assets-only packages (ADR-0008) is load-bearing
for install parity, not discoverability: without it, a code-backed package's
skills exist only as assets resolved from a registered package at load time,
and no copy path delivers them as consumer-visible files.

## Considered Options

- Compatibility constraint on all skill-bearing packages (chosen): every
  package's skills stay market-discoverable by layout, and assets-only
  packages keep install parity through the copy default
- Skills-market-only packages: rejected — it would forbid plugin
  registration for skills and break the always-fresh opt-in
- Treating the market as just another distribution target: rejected — the
  market consumes the same package artifact, so it constrains structure, not
  where the package is headed

## Consequences

- A produced package keeps its skills in a market-scannable layout —
  recommended `skills/<name>/SKILL.md` — whatever else it ships and however
  it installs; discoverability never depends on install mode
- A code-backed package's skills ride load-time installation: they stay
  discoverable, but no copy path delivers them as visible, editable consumer
  files, so consumers who want install parity via `npx skills add` must
  install the skill-bearing subset separately or the package author must
  split it; the constraint pushes authors to split skill collections into
  assets-only packages
- skills.sh listing follows from CLI-installed consumption (the CLI reports
  telemetry on installs of public repos), not a separate submission — so
  market-scannable layout plus consumption is all that listing requires
- The extension auditor checks market compatibility when reviewing a built
  package that ships skills
