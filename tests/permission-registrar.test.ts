import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { Config } from "@opencode-ai/plugin";
import { AssetPermissionRegistrar } from "../permission-registrar";

const ASSETS_DIR = path.resolve(import.meta.dirname, "..", "assets");
const ASSETS_PATTERN = path.join(ASSETS_DIR, "*").replaceAll("\\", "/");

function configWithPermission(value: unknown): Config {
  return { permission: value } as unknown as Config;
}

function externalDirectory(config: Config): unknown {
  return config.permission?.external_directory;
}

describe("AssetPermissionRegistrar", () => {
  test("registers an external_directory allow scoped to the assets directory", () => {
    const config: Config = {};

    new AssetPermissionRegistrar(ASSETS_DIR).register(config);

    expect(externalDirectory(config)).toEqual({ [ASSETS_PATTERN]: "allow" });
  });

  test("preserves existing external_directory rules", () => {
    const config = configWithPermission({ external_directory: { "/other/*": "ask" } });

    new AssetPermissionRegistrar(ASSETS_DIR).register(config);

    expect(externalDirectory(config)).toEqual({
      "/other/*": "ask",
      [ASSETS_PATTERN]: "allow",
    });
  });

  test("converts a shorthand external_directory value into a rule map", () => {
    const config = configWithPermission({ external_directory: "allow" });

    new AssetPermissionRegistrar(ASSETS_DIR).register(config);

    expect(externalDirectory(config)).toEqual({
      "*": "allow",
      [ASSETS_PATTERN]: "allow",
    });
  });

  test("does not override an explicit global deny", () => {
    const config = configWithPermission({ external_directory: "deny" });

    new AssetPermissionRegistrar(ASSETS_DIR).register(config);

    expect(externalDirectory(config)).toBe("deny");
  });

  test("does not override a rule-map global deny", () => {
    const config = configWithPermission({ external_directory: { "*": "deny" } });

    new AssetPermissionRegistrar(ASSETS_DIR).register(config);

    expect(externalDirectory(config)).toEqual({ "*": "deny" });
  });

  test("uses a forward-slash pattern on every platform", () => {
    const config: Config = {};

    new AssetPermissionRegistrar(ASSETS_DIR).register(config);

    const pattern = Object.keys(externalDirectory(config) as Record<string, string>)[0] ?? "";
    expect(pattern.includes("\\")).toBe(false);
    expect(pattern.endsWith("/assets/*")).toBe(true);
  });
});
