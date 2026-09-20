import type { Plugin } from "@opencode-ai/plugin";
import path from "node:path";
import { AgentLoader } from "./agent-loader";
import { AssetPermissionRegistrar } from "./permission-registrar";

const AGENTS_DIR = path.join(import.meta.dirname, "assets", "agents");
const ASSETS_DIR = path.join(import.meta.dirname, "assets");

const OpencodeArchitect: Plugin = async () => {
  const agents = await new AgentLoader(AGENTS_DIR).loadAgents();
  const permissionRegistrar = new AssetPermissionRegistrar(ASSETS_DIR);

  return {
    config: async (config) => {
      config.agent = config.agent || {};

      for (const [name, agentConfig] of Object.entries(agents)) {
        config.agent[name] = agentConfig;
      }

      permissionRegistrar.register(config);
    },
  };
};

export default OpencodeArchitect;
