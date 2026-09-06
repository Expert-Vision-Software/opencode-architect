# OpenCode skills — fundamentals

Skills are reusable instruction packages discovered on-demand via the native `skill` tool. Agents see each skill's name and description in `<available_skills>` and load the full SKILL.md only when relevant.

Locations (one folder per skill):

- Project: `.opencode/skills/<name>/SKILL.md`
- Global: `~/.config/opencode/skills/<name>/SKILL.md`
- Compatible paths: `.claude/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md` (project and home variants)

## Frontmatter rules

Only these fields are recognized; unknown fields are ignored:

| Field | Required | Rules |
| --- | --- | --- |
| `name` | yes | 1–64 chars, lowercase alphanumeric with single hyphens (`^[a-z0-9]+(-[a-z0-9]+)*$`), no leading/trailing `-`, no `--`, must match the folder name. |
| `description` | yes | 1–1024 chars. Third person; state what the skill does AND when to use it. This drives skill selection — be specific and include key trigger terms. |
| `license` | no | e.g. `MIT`. |
| `compatibility` | no | e.g. `opencode`. |
| `metadata` | no | String-to-string map. |

If a skill does not show up: verify `SKILL.md` capitalization, required frontmatter, unique names across locations, and that permissions don't `deny` it.

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
- Gate access with `permission.skill` glob patterns (`"internal-*": "deny"`); disable entirely with `tools: { skill: false }`.
