import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const UPGRADE_SKILL_ID = "opencode-v2-upgrade";

export const SKILL_DIRECTORIES: readonly string[] = [UPGRADE_SKILL_ID];

const SKILL_FILENAME = "SKILL.md";
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export interface LoadedSkill {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
}

interface SkillFrontmatter {
  name: string | null;
  description: string | null;
}

export class SkillLoader {
  private readonly skillsDir: string;

  public constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  public async loadSkills(): Promise<LoadedSkill[]> {
    const skills: LoadedSkill[] = [];

    for (const directory of SKILL_DIRECTORIES) {
      skills.push(await this.loadSkill(directory));
    }

    return skills;
  }

  private async loadSkill(directory: string): Promise<LoadedSkill> {
    const skillPath = path.join(this.skillsDir, directory, SKILL_FILENAME);
    const content = await readFile(skillPath, "utf-8");
    const match = content.match(FRONTMATTER_REGEX);

    if (!match || match.length < 3) {
      throw new Error(`Skill ${directory} must have YAML frontmatter`);
    }

    const frontmatter = parseYaml(match[1] as string) as SkillFrontmatter;
    const body = (match[2] as string).replace(/^\r?\n/, "");

    return {
      id: directory,
      name: this.skillName(frontmatter, directory),
      description: this.skillDescription(frontmatter, directory),
      path: skillPath,
      content: body,
    };
  }

  private skillName(frontmatter: SkillFrontmatter, directory: string): string {
    const name = frontmatter.name;
    if (typeof name !== "string" || name.length === 0) return directory;
    return name;
  }

  private skillDescription(frontmatter: SkillFrontmatter, directory: string): string {
    const description = frontmatter.description;
    if (typeof description !== "string" || description.length === 0) {
      throw new Error(`Skill ${directory} must declare a description`);
    }
    return description;
  }
}
