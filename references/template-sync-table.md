# Template sync table

The one classification of every mirrored `templates/` ↔ suite pair, answering
"are the templates and the code in sync?" without reading files two at a time.
Enforced by `tests/sync-table.test.ts`, which fails when this table and the
enforcement disagree — never restate a pair's sync state anywhere else;
reference this table.

Three states per pair:

- **byte-synced** — the test asserts the suite source equals the template body
  byte-for-byte. A change to one side must land on the other in the same commit.
- **declared-divergent** — the pair differs on purpose, and the policy names the
  difference; the test asserts that policy difference itself, not mere inequality.
- **fixture-covered** — a generated-only file (no suite counterpart) exercised
  by the rendered fixture in `tests/templates.test.ts`, which scaffolds a full
  package and runs typecheck, its own test gate, and install/status/uninstall
  against it.

## The table

| Template | Suite side / rendered target | State | Declared policy |
| --- | --- | --- | --- |
| `plugin-name.template.txt` | `src/plugin-name.ts` | byte-synced | — |
| `plugin-entry.template.txt` | `src/plugin-entry.ts` | byte-synced | — |
| `entry-predicate.template.txt` | `src/entry-predicate.ts` | byte-synced | — |
| `index.template.txt` | `index.ts` | byte-synced | — |
| `cli.template.txt` | `src/cli.ts` | declared-divergent | suite-only broad clear-cache modes (`--package`/`--all`/`--yes`/`--dry-run`) and status `--package` lookup; generated-only consent-gated `migrate` subcommand (generated clear-cache stays self-only) |
| `installer.template.txt` | `src/installer.ts` | declared-divergent | suite installer is an `Installer` class; the generated installer is function-style (`install`/`uninstall`/`status` functions) |
| `plugin-config.template.txt` | `src/plugin-config.ts` | declared-divergent | suite config editing is split (`config-reader` / `registration-detector` / `config-splicer`); the template is the self-contained monolith |
| `package-full.template.json` | `templates/package-basics.template.json` | declared-divergent | publisher-only npm-field expansion of package-basics (`repository`, `publisher`, `author`, `bugs`, `license`); the content declaration and `exports` carry through unchanged |
| `plugin-local.template.txt` | `src/plugin.ts` (rendered) | fixture-covered | — |
| `manifest.template.txt` | `src/manifest.ts` (rendered) | fixture-covered | — |
| `registration.template.txt` | `src/registration.ts` (rendered) | fixture-covered | — |
| `skill-structure.template.md` | `skills/<identifier>/SKILL.md` (rendered) | fixture-covered | — |
| `package-basics.template.json` | `package.json` (rendered) | fixture-covered | — |
| `tsconfig.template.json` | `tsconfig.json` (rendered) | fixture-covered | — |

Not mirrored: `prompts.template.txt` is an authoring aid (interactive
confirmation helpers for publisher flows) with no suite counterpart and no
rendered output — no sync state applies.

## Widening rule

A pair moves to byte-synced whenever the two bodies can genuinely be identical:
make them identical, then move the row. A divergence that is not in this table
is drift — either declare it here with its policy, or fix it.
