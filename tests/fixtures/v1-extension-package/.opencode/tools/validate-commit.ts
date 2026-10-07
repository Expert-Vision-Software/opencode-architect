import { tool } from "@opencode-ai/plugin";
import { z } from "zod";

export const validateCommit = tool({
  description: "Validate a conventional commit message",
  args: { message: z.string() },
  execute: async ({ message }) => {
    return /^(feat|fix|docs|chore)(\(.+\))?:\s.+/.test(message) ? "valid" : "invalid";
  },
});
