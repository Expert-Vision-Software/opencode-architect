import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Agent } from "@opencode/plugin/effect";

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
export const RELATIVE_REFERENCE_REGEX = /`((?:\.{1,2})(?:[\\/][^`\\/]+)+)`/g;

export interface LoadedAgent {
  name: string;
  system: string;
  description: string;
  mode: Agent.Info["mode"];
  permissions: Agent.Info["permissions"];
}

interface AgentFrontmatter {
  description: string;
  mode: Agent.Info["mode"];
  tools: Record<string, boolean> | null;
  permission: Record<string, PermissionEffect | Record<string, PermissionEffect>> | null;
}

type PermissionEffect = "allow" | "ask" | "deny";

export class AgentLoader {
  private readonly agentsDir: string;

  public constructor(agentsDir: string) {
    this.agentsDir = agentsDir;
  }

  public async loadAgents(): Promise<Record<string, LoadedAgent>> {
    const agents: Record<string, LoadedAgent> = {};

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
  ): Promise<LoadedAgent> {
    const match = content.match(FRONTMATTER_REGEX);

    if (!match || match.length < 3) {
      throw new Error(`Agent ${agentName} must have YAML frontmatter`);
    }

    const frontmatterYaml = match[1] as string;
    const rawPrompt = match[2] as string;
    const frontmatter = parseYaml(frontmatterYaml) as AgentFrontmatter;
    const system = this.resolveReferencePaths(
      rawPrompt.replace(/^\r?\n/, ""),
      path.dirname(agentPath),
    );

    return {
      name: agentName,
      system,
      description: frontmatter.description,
      mode: frontmatter.mode,
      permissions: [
        ...this.toolRules(frontmatter.tools ?? null),
        ...this.permissionRules(frontmatter.permission ?? null),
      ],
    };
  }

  private resolveReferencePaths(prompt: string, agentDir: string): string {
    return prompt.replace(RELATIVE_REFERENCE_REGEX, (_token: string, relativePath: string) => {
      const normalized = relativePath.replaceAll("\\", "/");
      const absolute = path.resolve(agentDir, normalized).replaceAll("\\", "/");
      return `\`${absolute}\``;
    });
  }

  private toolRules(tools: Record<string, boolean> | null): Agent.Info["permissions"] {
    if (tools === null) return [];
    return Object.entries(tools).map(([tool, enabled]) => ({
      action: this.normalizeAction(tool),
      resource: "*",
      effect: enabled ? "allow" : "deny",
    }));
  }

  private permissionRules(
    permission: Record<string, PermissionEffect | Record<string, PermissionEffect>> | null,
  ): Agent.Info["permissions"] {
    if (permission === null) return [];
    return Object.entries(permission).flatMap(([key, rule]) => {
      if (typeof rule === "string") {
        return [{ action: this.normalizeAction(key), resource: "*", effect: rule }];
      }
      return Object.entries(rule).map(([resource, effect]) => ({
        action: this.normalizeAction(key),
        resource,
        effect,
      }));
    });
  }

  private normalizeAction(action: string): string {
    if (action === "write" || action === "patch") return "edit";
    if (action === "task") return "subagent";
    if (action === "bash") return "shell";
    return action;
  }
}
