import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const README_PATH = path.resolve(import.meta.dirname, "..", "README.md");

async function badgeRow(): Promise<string> {
  const lines = (await readFile(README_PATH, "utf-8")).split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.startsWith("# "));
  const row = lines[headingIndex + 1] ?? "";
  return row.trim();
}

describe("README badge row (D7)", () => {
  test("one single line directly below the heading with the required badges", async () => {
    const row = await badgeRow();

    expect(row).toContain("img.shields.io/npm/v/opencode-architect");
    expect(row).toContain("Runtime-Bun");
    expect(row).toContain("License-MIT");
    expect(row).toContain("Platforms-Linux");
    expect(row).toContain("opencode-plugin-blueviolet");
    expect(row).not.toMatch(/\r?\n.*shields\.io/);
  });

  test("badge links resolve: license file and platforms anchor exist", async () => {
    const row = await badgeRow();

    const licenseTarget = row.match(/\[!\[License: MIT\]\([^)]+\)\]\(([^)]+)\)/)?.[1] ?? "";
    expect(licenseTarget).toBe("LICENSE.md");
    expect(existsSync(path.resolve(path.dirname(README_PATH), licenseTarget))).toBe(true);

    const platformsTarget = row.match(/\[!\[Platforms\]\([^)]+\)\]\(([^)]+)\)/)?.[1] ?? "";
    expect(platformsTarget.startsWith("#")).toBe(true);
    const readme = await readFile(README_PATH, "utf-8");
    expect(headingSlugExists(readme, platformsTarget.slice(1))).toBe(true);
  });

  test("badge URLs use the repo's canonical casing", async () => {
    const row = await badgeRow();
    expect(row).not.toContain("expert-vision-software/opencode-architect");
  });
});

function headingSlugExists(readme: string, slug: string): boolean {
  return readme
    .split(/\r?\n/)
    .filter((line) => line.startsWith("##"))
    .some((line) => {
      const text = line.replace(/^#+\s*/, "").toLowerCase().replace(/[^a-z0-9 -]/g, "").trim();
      return text.replace(/\s+/g, "-") === slug;
    });
}

describe("shipped config snippets (D8)", () => {
  test("README snippets use the plugin key with canonical entries, never plugins", async () => {
    const readme = await readFile(README_PATH, "utf-8");

    expect(readme).toContain('"plugin": ["opencode-architect@latest"]');
    expect(readme).not.toContain('"plugins"');
    expect(readme).toContain("opencode-architect@latest");
  });
});
