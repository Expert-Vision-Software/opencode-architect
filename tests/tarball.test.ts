import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const ROOT = new URL("..", import.meta.url).pathname;

interface PackFile {
  path: string;
}

function packDryRun(): PackFile[] {
  const output = execSync("npm pack --dry-run --json", { encoding: "utf-8", cwd: ROOT });
  return JSON.parse(output)[0].files as PackFile[];
}

function walkDisk(entry: string): string[] {
  const base = `${ROOT}${entry}`;
  const files: string[] = [];
  const visit = (relative: string) => {
    for (const item of readdirSync(`${base}${relative}`, { withFileTypes: true })) {
      if (item.isDirectory()) visit(`${relative}/${item.name}`);
      else files.push(`${entry}${relative}/${item.name}`);
    }
  };
  visit("");
  return files.sort();
}

function expectedPaths(): string[] {
  const paths: string[] = [];
  for (const entry of packageJson.files) {
    if (entry.endsWith(".ts")) {
      paths.push(entry);
      continue;
    }
    paths.push(...walkDisk(entry));
  }
  return paths;
}

describe("tarball contents", () => {
  test("every file in the package.json files whitelist ships in the tarball", () => {
    const shipped = new Set(packDryRun().map(file => file.path));
    const missing = expectedPaths().filter(path => !shipped.has(path));
    expect(missing).toEqual([]);
  });

  test("the tarball declares no files outside the whitelist", () => {
    const whitelist = new Set(expectedPaths());
    const extra = packDryRun().map(file => file.path).filter(path =>
      !whitelist.has(path)
      && path !== "package.json"
      && path !== "README.md"
      && path !== "LICENSE.md"
      && !path.startsWith("node_modules/")
    );
    expect(extra).toEqual([]);
  });
});
