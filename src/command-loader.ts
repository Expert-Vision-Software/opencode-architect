import { readFile } from "node:fs/promises";
import path from "node:path";
import { FrontmatterParser } from "./frontmatter";

export const COMMAND_FILENAMES: readonly string[] = ["upgrade-opencode-v2.md"];

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
  private readonly frontmatter = new FrontmatterParser();

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
    const document = this.frontmatter.parse(content, `Command ${filename}`);
    const frontmatter = document.attributes as unknown as CommandFrontmatter;

    return {
      name: path.basename(filename, ".md"),
      description: this.commandDescription(frontmatter, filename),
      template: document.body.trimEnd(),
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
