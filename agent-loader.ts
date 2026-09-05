import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentConfig } from "@opencode-ai/sdk";

export const AGENT_FILENAMES: readonly string[] = [
  "opencode-agent-designer.md",
  "opencode-architect.md",
  "opencode-command-crafter.md",
  "opencode-extension-auditor.md",
  "opencode-packager.md",
  "opencode-publisher.md",
  "opencode-mcp-integrator.md",
  "opencode-plugin-engineer.md",
  "opencode-skill-creator.md",
  "opencode-tool-builder.md",
];

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const RELATIVE_REFERENCE_REGEX = /`((?:\.{1,2})(?:[\\/][^`\\/]+)+)`/g;

interface AgentFrontmatter {
  description: string;
  mode: "primary" | "subagent" | "all";
  tools?: Record<string, boolean>;
  permission?: {
    edit?: "ask" | "allow" | "deny";
    bash?: ("ask" | "allow" | "deny") | Record<string, "ask" | "allow" | "deny">;
    webfetch?: "ask" | "allow" | "deny";
    doom_loop?: "ask" | "allow" | "deny";
    external_directory?: "ask" | "allow" | "deny";
  };
}

export class AgentLoader {
  private readonly agentsDir: string;

  public constructor(agentsDir: string) {
    this.agentsDir = agentsDir;
  }

  public async loadAgents(): Promise<Record<string, AgentConfig>> {
    const agents: Record<string, AgentConfig> = {};

    for (const filename of AGENT_FILENAMES) {
      const agentPath = path.join(this.agentsDir, filename);
      const agentContent = await readFile(agentPath, "utf-8");
      const agentName = path.basename(filename, ".md");
      agents[agentName] = await this.parseAgentMarkdown(agentPath, agentContent, agentName);
    }

    return agents;
  }

  private async parseAgentMarkdown(
    agentPath: string,
    content: string,
    agentName: string,
  ): Promise<AgentConfig> {
    const match = content.match(FRONTMATTER_REGEX);

    if (!match || match.length < 3) {
      throw new Error(`Agent ${agentName} must have YAML frontmatter`);
    }

    const frontmatterYaml = match[1] as string;
    const rawPrompt = match[2] as string;
    const frontmatter = parseYaml(frontmatterYaml) as AgentFrontmatter;
    const prompt = this.resolveReferencePaths(
      rawPrompt.replace(/^\r?\n/, ""),
      path.dirname(agentPath),
    );

    const config: AgentConfig = {
      description: frontmatter.description,
      mode: frontmatter.mode,
      prompt,
    };

    if (frontmatter.tools) {
      config.tools = frontmatter.tools;
    }

    if (frontmatter.permission) {
      config.permission = frontmatter.permission;
    }

    return config;
  }

  private resolveReferencePaths(prompt: string, agentDir: string): string {
    return prompt.replace(RELATIVE_REFERENCE_REGEX, (_token: string, relativePath: string) => {
      const normalized = relativePath.replaceAll("\\", "/");
      const absolute = path.resolve(agentDir, normalized).replaceAll("\\", "/");
      return `\`${absolute}\``;
    });
  }
}
