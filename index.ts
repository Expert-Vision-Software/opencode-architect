import type { Plugin } from "@opencode-ai/plugin";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AgentLoader } from "./agent-loader";
import { AssetPermissionRegistrar } from "./permission-registrar";

const PACKAGE_NAME = "opencode-architect";

export function createOpencodeArchitect(agentsDir: string, assetsDir: string): Plugin {
  let failureAdvised = false;

  async function adviseFailureOnce(message: string): Promise<void> {
    if (failureAdvised) return;
    failureAdvised = true;
    await emitAdvisory(message);
  }

  async function emitAdvisory(message: string): Promise<void> {
    let text: string;
    try {
      const version = await readPackageVersion();
      text =
        `Failed to load the bundled agent suite. Run: bunx ${PACKAGE_NAME} clear-cache, then ` +
        `reinstall and restart OpenCode. The stale cache copy is ` +
        `~/.cache/opencode/packages/${PACKAGE_NAME}@${version}. Cause: ${message}`;
    } catch {
      text =
        `Failed to load the bundled agent suite. Run: bunx ${PACKAGE_NAME} clear-cache, then ` +
        `reinstall and restart OpenCode. The stale cache copy lives under ` +
        `~/.cache/opencode/packages/. Cause: ${message}`;
    }
    try {
      console.warn(`[${PACKAGE_NAME}] ${text}`);
    } catch {}
  }

  return async () => ({
    config: async (config) => {
      try {
        const agents = await new AgentLoader(agentsDir).loadAgents();
        config.agent = config.agent || {};
        for (const [name, agentConfig] of Object.entries(agents)) {
          config.agent[name] = agentConfig;
        }
        new AssetPermissionRegistrar(assetsDir).register(config);
      } catch (error) {
        await adviseFailureOnce(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

async function readPackageVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(import.meta.dirname, "package.json"), "utf-8"),
  ) as { version: string };
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("unreadable package metadata");
  }
  return manifest.version;
}

const OpencodeArchitect: Plugin = createOpencodeArchitect(
  path.join(import.meta.dirname, "assets", "agents"),
  path.join(import.meta.dirname, "assets"),
);

export default OpencodeArchitect;
