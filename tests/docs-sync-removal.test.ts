import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const REMOVED_MODULES = [
  "scripts/fetch-opencode-docs.ts",
  "scripts/logger.ts",
  "commands/sync-docs.ts",
  "tools/sync-docs.ts",
];
const DOCS_SYNC_FRAGMENTS = [
  "sync-docs",
  "fetch-opencode-docs",
  "scripts/logger",
  "SilentLogger",
  "OpenCodeDocsFetcher",
  "syncDocsOnStartup",
];

describe("docs-sync removal", () => {
  test("docs-sync modules are deleted from the package", () => {
    for (const modulePath of REMOVED_MODULES) {
      expect(existsSync(path.join(REPO_ROOT, modulePath)), `${modulePath} still exists`).toBe(
        false,
      );
    }
  });

  test("index.ts no longer imports or registers docs-sync", async () => {
    const indexSource = await readFile(path.join(REPO_ROOT, "index.ts"), "utf-8");

    for (const fragment of DOCS_SYNC_FRAGMENTS) {
      expect(indexSource.includes(fragment), `index.ts mentions ${fragment}`).toBe(false);
    }
  });
});
