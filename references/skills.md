# OpenCode skills — fundamentals

Skills are reusable instruction packages discovered on-demand via the native
`skill` tool. Discovery scans config roots for `skill/` and `skills/`
directories (project: `.opencode/skills/<name>/SKILL.md`, global:
`~/.config/opencode/skills/<name>/SKILL.md`, plus `.claude/`/`.agents/`
roots) and honors config `skills` paths/URLs. Agents see each skill's name
and description in `<available_skills>` and load the full SKILL.md only when
relevant. Facts per `docs/reference/opencode-v2-facts.md` §12 (discovery,
frontmatter fate), §4 (permission action).

## Frontmatter rules

`SKILL.md` frontmatter is parsed with gray-matter. The recognized fields:

| Field | Required | Rules |
| --- | --- | --- |
| `name` | no | Defaults to the directory/file-derived id when absent. No longer regex-enforced and no longer must match the folder. Authoring convention stays: lowercase alphanumeric with single hyphens (`processing-pdfs`). |
| `description` | parser-optional; authoring-required | Third person; state what the skill does AND when to use it. This drives skill selection — be specific and include key trigger terms. |
| `disable-model-invocation` | no | Boolean; maps to `autoinvoke` (v2 replaces free-form `metadata` flags). |

Dropped v1 frontmatter: `license`, `compatibility`, and free-form
`metadata` are not carried into the v2 skill record (only
`metadata["opencode/autoinvoke"]` is read). Facts §12.

Skills can also be registered programmatically by plugins via
`ctx.skill.transform`. Facts §12.

If a skill does not show up: verify `SKILL.md` capitalization, required
frontmatter, unique names across locations, and that permissions don't
`deny` it.

Every frontmatter property value is enclosed in double quotation marks —
`name: "world-greeter"`, `description: "Greets in five languages."` — never
bare values (checklist D6). Unquoted YAML colons are sanitized for
cross-agent compatibility, but quoting is the house rule. Facts §12.

## Progressive disclosure

- Metadata (name + description) is pre-loaded at startup; the body is read on demand; bundled files are read only as needed — no context penalty until accessed.
- Keep SKILL.md under ~500 lines; split deeper content into separate files.
- Default assumption: the model is already smart — only add context it doesn't have.

## Co-located references pattern

Bundle detail files next to SKILL.md in the skill folder:

```
my-skill/
├── SKILL.md          # overview + navigation (loaded when triggered)
├── reference.md      # loaded as needed
├── examples.md       # loaded as needed
└── scripts/tool.py   # executed, not loaded
```

- Keep references **one level deep** from SKILL.md — nested references cause partial reads. Link each file directly from SKILL.md.
- Add a table of contents at the top of reference files over 100 lines.
- Make execution intent explicit: "Run `scripts/foo.py`" (execute) vs "See `scripts/foo.py`" (read as reference).

## Base-directory convention

Address co-located files **relative to the skill's own directory** (its base directory), always with **forward slashes** (`reference/guide.md`, not `reference\guide.md` or absolute paths). Forward-slash relative paths work on every platform.

## Authoring quick rules

- General authoring rules (degrees of freedom, workflows, defaults, terminology): see `prompt-engineering.md`.
- Gerund names read well (`processing-pdfs`); vague names (`helper`, `utils`) hide the skill from selection.
- Gate access with a permission rule on the `skill` action — e.g.
  `{ "action": "skill", "resource": "internal-*", "effect": "deny" }` — or
  disable entirely with `{ "action": "skill", "resource": "*", "effect":
  "deny" }`. Facts §4.
