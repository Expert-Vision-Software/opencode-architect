import { parse as parseYaml } from "yaml";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export interface FrontmatterDocument {
  attributes: Record<string, unknown>;
  body: string;
}

export class FrontmatterParser {
  public parse(content: string, label: string): FrontmatterDocument {
    const match = content.match(FRONTMATTER_REGEX);

    if (!match || match.length < 3) {
      throw new Error(`${label} must have YAML frontmatter`);
    }

    return {
      attributes: (parseYaml(match[1] as string) ?? {}) as Record<string, unknown>,
      body: (match[2] as string).replace(/^\r?\n/, ""),
    };
  }
}
