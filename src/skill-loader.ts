import { readFile } from "node:fs/promises";
import path from "node:path";
import { FrontmatterParser } from "./frontmatter";

export const UPGRADE_SKILL_ID = "opencode-v2-upgrade";

export const SKILL_DIRECTORIES: readonly string[] = [UPGRADE_SKILL_ID];

const SKILL_FILENAME = "SKILL.md";

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
  private readonly frontmatter = new FrontmatterParser();

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
    const document = this.frontmatter.parse(content, `Skill ${directory}`);
    const frontmatter = document.attributes as unknown as SkillFrontmatter;

    return {
      id: directory,
      name: this.skillName(frontmatter, directory),
      description: this.skillDescription(frontmatter, directory),
      path: skillPath,
      content: document.body,
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
