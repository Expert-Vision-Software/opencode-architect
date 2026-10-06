import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { PermissionEvaluation } from "@opencode/plugin/effect/permission";
import { AssetPermissionAdvisor } from "../src/asset-permission-advisor";

const ASSETS_DIR = path.resolve(import.meta.dirname, "..");

function advisorFor(assetsDir: string = ASSETS_DIR): AssetPermissionAdvisor {
  return new AssetPermissionAdvisor(assetsDir);
}

function evaluated(input: Partial<PermissionEvaluation>): PermissionEvaluation {
  return {
    action: "external_directory",
    resources: [],
    effect: "ask",
    ...input,
  } as PermissionEvaluation;
}

describe("AssetPermissionAdvisor", () => {
  test("upgrades a pending ask to allow for resources inside the assets directory", () => {
    const input = evaluated({ resources: [path.join(ASSETS_DIR, "references", "plugins.md")] });

    advisorFor().evaluate(input);

    expect(input.effect).toBe("allow");
  });

  test("treats the assets directory itself as in bounds", () => {
    const input = evaluated({ resources: [ASSETS_DIR] });

    advisorFor().evaluate(input);

    expect(input.effect).toBe("allow");
  });

  test("leaves resources outside the assets directory untouched", () => {
    const input = evaluated({ resources: [path.join(path.dirname(ASSETS_DIR), "elsewhere.md")] });

    advisorFor().evaluate(input);

    expect(input.effect).toBe("ask");
  });

  test("leaves a batch mixed with outside resources untouched", () => {
    const input = evaluated({
      resources: [path.join(ASSETS_DIR, "references", "plugins.md"), "C:/outside/other.md"],
    });

    advisorFor().evaluate(input);

    expect(input.effect).toBe("ask");
  });

  test("leaves non-external-directory actions untouched", () => {
    const input = evaluated({
      action: "read",
      resources: [path.join(ASSETS_DIR, "references", "plugins.md")],
    });

    advisorFor().evaluate(input);

    expect(input.effect).toBe("ask");
  });

  test("leaves an explicit deny untouched", () => {
    const input = evaluated({ effect: "deny", resources: [path.join(ASSETS_DIR, "README.md")] });

    advisorFor().evaluate(input);

    expect(input.effect).toBe("deny");
  });

  test("leaves an already-allowed outcome untouched", () => {
    const input = evaluated({ effect: "allow", resources: [path.join(ASSETS_DIR, "README.md")] });

    advisorFor().evaluate(input);

    expect(input.effect).toBe("allow");
  });

  test("matches windows-style resources against a windows-style assets directory", () => {
    const advisor = advisorFor("C:\\packages\\opencode-architect");
    const input = evaluated({ resources: ["C:/packages/opencode-architect/references/tools.md"] });

    advisor.evaluate(input);

    expect(input.effect).toBe("allow");
  });

  test("ignores sibling directories that share a prefix", () => {
    const advisor = advisorFor("C:/packages/opencode-architect");
    const input = evaluated({ resources: ["C:/packages/opencode-architect-extra/README.md"] });

    advisor.evaluate(input);

    expect(input.effect).toBe("ask");
  });
});
