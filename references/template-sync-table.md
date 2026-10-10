# Template sync table

The one classification of every mirrored `templates/`  suite pair, answering
"are the templates and the code in sync?" without reading files two at a time.
Enforced by `tests/sync-table.test.ts`, which fails when this table and the
enforcement disagree - never restate a pair's sync state anywhere else;
reference this table.

Since the core carve-out (ADR-0013) the templates are no longer a structural
source of truth: the generated package consumes the shared machinery through
the `opencode-architect/core` subpath of a local `file:` dependency, and the
remaining templates are adapter renderings the scaffold renderer emits.

Three states per pair:

- **byte-synced** - the test asserts the suite source equals the template body
  byte-for-byte. A change to one side must land on the other in the same commit.
- **declared-divergent** - the pair differs on purpose, and the policy names the
  difference; the test asserts that policy difference itself, not mere inequality.
- **fixture-covered** - a rendered-only file exercised by the rendered fixture in
  `tests/templates.test.ts`, which scaffolds a full package, links the core
  dependency, and runs typecheck, its own test gate, and install/status/uninstall
  against it.

## The table

| Template | Suite side / rendered target | State | Declared policy |
| --- | --- | --- | --- |
| `index.template.txt` | `index.ts` | byte-synced | - |
| `cli.template.txt` | `src/cli.ts` | declared-divergent | suite-only broad clear-cache modes (`--package`/`--all`/`--yes`/`--dry-run`) and status `--package` lookup; generated-only consent-gated `migrate` subcommand; both are thin adapters over the core dependency |
| `installer.template.txt` | `src/installer.ts` | declared-divergent | suite installer is an `Installer` class orchestrating the suite payload; the generated installer is a function-style adapter whose policy constants (package, skill, command, asset layout) sit over the core dependency |
| `package-full.template.json` | `templates/package-basics.template.json` | declared-divergent | publisher-only npm-field expansion of package-basics (`repository`, `publisher`, `author`, `bugs`, `license`); the content declaration and `exports` carry through unchanged |
| `plugin-local.template.txt` | `src/plugin.ts` (rendered) | fixture-covered | - |
| `skill-structure.template.md` | `skills/<identifier>/SKILL.md` (rendered) | fixture-covered | - |
| `package-basics.template.json` | `package.json` (rendered) | fixture-covered | - |
| `tsconfig.template.json` | `tsconfig.json` (rendered) | fixture-covered | - |

## Dissolved into the core dependency (ADR-0013)

These former pairs no longer exist as templates; their content is the
`opencode-architect/core` module and generated packages import it through the
dependency the renderer records in `package.json`. The manifest format those
templates wrote is frozen and still read by the core (ADR-0013, compatibility
rule).

| Former template | Former rendered target | Now provided by |
| --- | --- | --- |
| `plugin-name.template.txt` | `src/plugin-name.ts` | `core/plugin-name.ts` |
| `plugin-entry.template.txt` | `src/plugin-entry.ts` | `core/plugin-entry.ts` |
| `entry-predicate.template.txt` | `src/entry-predicate.ts` | `core/entry-predicate.ts` |
| `manifest.template.txt` | `src/manifest.ts` | `core/manifest.ts` |
| `registration.template.txt` | `src/registration.ts` | `core/config-reader.ts` + `core/registration-detector.ts` |
| `plugin-config.template.txt` | `src/plugin-config.ts` | `core/plugin-config.ts` |

Not mirrored: `prompts.template.txt` is an authoring aid (interactive
confirmation helpers for publisher flows) with no suite counterpart and no
rendered output - no sync state applies.

## Widening rule

A pair moves to byte-synced whenever the two bodies can genuinely be identical:
make them identical, then move the row. A divergence that is not in this table
is drift - either declare it here with its policy, or fix it. Machinery that
both sides need belongs in `src/core`, not in a widened pair.
