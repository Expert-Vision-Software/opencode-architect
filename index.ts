import type { Plugin } from "@opencode-ai/plugin";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AgentLoader } from "./agent-loader";
import { AssetPermissionRegistrar } from "./permission-registrar";

const PACKAGE_NAME = "opencode-architect";

export class OpencodeArchitectPlugin {
  private readonly agentsDir: string;
  private readonly assetsDir: string;
  private readonly readVersion: () => Promise<string>;
  private failureAdvised = false;

  constructor(
    agentsDir: string | null = null,
    assetsDir: string | null = null,
    readVersion: (() => Promise<string>) | null = null,
  ) {
    this.agentsDir = agentsDir ?? path.join(import.meta.dirname, "assets", "agents");
    this.assetsDir = assetsDir ?? path.join(import.meta.dirname, "assets");
    this.readVersion = readVersion ?? (() => this.readPackageMetadata());
  }

  public toPlugin(): Plugin {
    return async (input) => {
      const directory = typeof input?.directory === "string" ? input.directory : process.cwd();
      return {
        config: async (config) => {
          try {
            const agents = await new AgentLoader(this.agentsDir).loadAgents();
            config.agent = config.agent || {};
            for (const [name, agentConfig] of Object.entries(agents)) {
              config.agent[name] = agentConfig;
            }
            new AssetPermissionRegistrar(this.assetsDir).register(config);
          } catch (error) {
            await this.adviseFailureOnce(error instanceof Error ? error.message : String(error));
          }
        },
      };
    };
  }

  private async adviseFailureOnce(message: string): Promise<void> {
    if (this.failureAdvised) return;
    this.failureAdvised = true;
    await this.emitAdvisory(message);
  }

  private async emitAdvisory(message: string): Promise<void> {
    const prefix =
      `Failed to load the bundled agent suite. Run: bunx ${PACKAGE_NAME} clear-cache, then ` +
      `reinstall and restart OpenCode. The stale cache copy is `;
    let text: string;
    try {
      text = `${prefix}~/.cache/opencode/packages/${PACKAGE_NAME}@${await this.readVersion()}. Cause: ${message}`;
    } catch {
      text = `${prefix}~/.cache/opencode/packages/${PACKAGE_NAME}@<version>. Cause: ${message}`;
    }
    try {
      console.warn(`[${PACKAGE_NAME}] ${text}`);
    } catch {}
  }

  private async readPackageMetadata(): Promise<string> {
    const manifest = JSON.parse(
      await readFile(path.join(import.meta.dirname, "package.json"), "utf-8"),
    ) as { version: string };
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      throw new Error("unreadable package metadata");
    }
    return manifest.version;
  }
}

const opencodeArchitect = new OpencodeArchitectPlugin();

export default opencodeArchitect.toPlugin();
