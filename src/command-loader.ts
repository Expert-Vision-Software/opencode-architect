import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const COMMAND_FILENAMES: readonly string[] = ["upgrade-opencode-v2.md"];

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export interface LoadedCommand {
  name: string;
  description: string;
  template: string;
}

interface CommandFrontmatter {
  description: string | null;
}

export class CommandLoader {
  private readonly commandsDir: string;

  public constructor(commandsDir: string) {
    this.commandsDir = commandsDir;
  }

  public async loadCommands(): Promise<LoadedCommand[]> {
    const commands: LoadedCommand[] = [];

    for (const filename of COMMAND_FILENAMES) {
      commands.push(await this.loadCommand(filename));
    }

    return commands;
  }

  private async loadCommand(filename: string): Promise<LoadedCommand> {
    const commandPath = path.join(this.commandsDir, filename);
    const content = await readFile(commandPath, "utf-8");
    const match = content.match(FRONTMATTER_REGEX);

    if (!match || match.length < 3) {
      throw new Error(`Command ${filename} must have YAML frontmatter`);
    }

    const frontmatter = parseYaml(match[1] as string) as CommandFrontmatter;
    const template = (match[2] as string).replace(/^\r?\n/, "").trimEnd();

    return {
      name: path.basename(filename, ".md"),
      description: this.commandDescription(frontmatter, filename),
      template,
    };
  }

  private commandDescription(frontmatter: CommandFrontmatter, filename: string): string {
    const description = frontmatter.description;
    if (typeof description !== "string" || description.length === 0) {
      throw new Error(`Command ${filename} must declare a description`);
    }
    return description;
  }
}
