import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as core from "../src/core/index";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

describe("the core module seam", () => {
  test("package.json exports ./core", async () => {
    const manifest = JSON.parse(await readFile(path.join(REPO_ROOT, "package.json"), "utf-8")) as {
      exports: Record<string, string>;
    };
    expect(manifest.exports["./core"]).toBe("./src/core/index.ts");
  });

  test("the core module exposes the machinery the adapters share", async () => {
    for (const symbol of [
      // environment + scope + cache paths
      "realEnvironment",
      "scopeBase",
      "NpmCache",
      "removeCacheTargets",
      // name matching
      "PluginNameNormalizer",
      "PluginEntryResolver",
      "EntryPredicate",
      // config splice
      "ConfigReader",
      "RegistrationDetector",
      "ConfigSplicer",
      "PluginConfigEditor",
      // manifest io + hashes (generated-package format, frozen per ADR-0013)
      "InstallManifest",
      "manifestPath",
      "sha256",
      "listFilesRecursive",
      // effective-version pipeline
      "LoadedVersionResolver",
      "StatusReporter",
      "RegistryVersionChecker",
    ]) {
      expect(core, `src/core/index.ts must export ${symbol}`).toHaveProperty(symbol);
    }
  });

  test("core exports the frozen generated-manifest types", async () => {
    const source = await readFile(path.join(REPO_ROOT, "src", "core", "index.ts"), "utf-8");
    expect(source).toContain("InstallMode");
    expect(source).toContain("ManifestData");
    expect(source).toContain("StatusReport");
    expect(source).toContain("Scope");
  });
});
