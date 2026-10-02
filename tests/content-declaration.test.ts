import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

const readRepoFile = (relativePath: string): Promise<string> =>
  readFile(path.join(REPO_ROOT, relativePath), "utf-8");

describe("content declaration", () => {
  test("both package.json templates declare the content field", async () => {
    for (const template of [
      "assets/templates/package-basics.template.json",
      "assets/templates/package-full.template.json",
    ]) {
      const source = await readRepoFile(template);
      const body = source.split("---")[1] ?? "";
      const parsed = JSON.parse(body);
      expect(parsed.content, `${template} content field`).toBe("assets");
    }
  });

  test("packager derives the declaration from its inventory", async () => {
    const source = await readRepoFile("assets/agents/opencode-packager.md");
    expect(source).toContain('"content": "assets"');
    expect(source).toContain('"code"');
  });

  test("publisher verifies and carries the declaration", async () => {
    const source = await readRepoFile("assets/agents/opencode-publisher.md");
    expect(source).toContain("content` declaration");
    expect(source).toContain('declares `"content"`');
  });
});
