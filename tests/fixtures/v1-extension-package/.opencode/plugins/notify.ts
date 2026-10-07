import { Plugin } from "@opencode-ai/plugin";

export const NotifyPlugin: Plugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`echo "session idle"`;
      }
    },
    "tool.execute.before": async (input) => {
      if (input.tool === "bash") {
        throw new Error("bash is disabled");
      }
    },
  };
};
