import { Effect } from "effect";
import { Plugin } from "@opencode/plugin/effect";

export default Plugin.define({
  id: "acme-notify",
  effect: (context) =>
    Effect.gen(function* () {
      yield* context.event.subscribe();

      yield* context.tool.hook("execute.before", () => Effect.void);

      yield* context.tool.transform((editor) => {
        editor.add({
          name: "validate-commit",
          description: "Validate a conventional commit message",
          input: {
            type: "object",
            properties: {
              message: { type: "string", description: "Commit message to validate" },
            },
            required: ["message"],
            additionalProperties: false,
          },
          execute: (args) =>
            Effect.succeed({
              output: /^(feat|fix|docs|chore)(\(.+\))?:\s.+/.test(args.message) ? "valid" : "invalid",
            }),
        });
      });
    }),
});
