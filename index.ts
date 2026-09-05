import type { Plugin } from "@opencode-ai/plugin";
import path from "node:path";
import { AgentLoader } from "./agent-loader";

const AGENTS_DIR = path.join(import.meta.dirname, "assets", "agents");

const OpencodeArchitect: Plugin = async () => {
  const agents = await new AgentLoader(AGENTS_DIR).loadAgents();

  return {
    config: async (config) => {
      config.agent = config.agent || {};

      for (const [name, agentConfig] of Object.entries(agents)) {
        config.agent[name] = agentConfig;
      }
    },
  };
};

export default OpencodeArchitect;
