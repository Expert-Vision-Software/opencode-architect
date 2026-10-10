import { describe, expect, test } from "bun:test";
import { ScaffoldRenderer, type RenderedFile } from "../src/scaffold/renderer";

function pathSet(files: RenderedFile[]): string[] {
  return files.map((file) => file.relativePath).sort();
}

function contentOf(files: RenderedFile[], relativePath: string): string {
  const found = files.find((file) => file.relativePath === relativePath);
  if (found === undefined) throw new Error(`no rendered file: ${relativePath}`);
  return found.content;
}

describe("scaffold renderer", () => {
  test("an assets-only plan renders the full conformant tree", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills"] });

    expect(pathSet(files)).toEqual(
      [
        "index.ts",
        "src/cli.ts",
        "src/installer.ts",
        "src/manifest.ts",
        "src/plugin-config.ts",
        "src/plugin-entry.ts",
        "src/plugin-name.ts",
        "src/plugin.ts",
        "src/registration.ts",
        "package.json",
        "skills/mytool/SKILL.md",
        "tests/plugin.contract.test.ts",
        "tsconfig.json",
      ].sort(),
    );
  });

  test("the package manifest carries the derived name, bin, files, and assets content", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills"] });
    const manifest = JSON.parse(contentOf(files, "package.json")) as {
      name: string;
      content: string;
      bin: Record<string, string>;
      files: string[];
      exports: Record<string, string>;
      dependencies: Record<string, string>;
    };

    expect(manifest.name).toBe("opencode-mytool");
    expect(manifest.bin).toEqual({ "opencode-mytool": "src/cli.ts" });
    expect(manifest.files).toEqual(["index.ts", "src", "skills"]);
    expect(manifest.content).toBe("assets");
    expect(manifest.exports["./server"]).toBe("./index.ts");
    expect(manifest.exports["."]).toBe("./index.ts");
    expect(manifest.dependencies["@opencode/plugin"]).toBe("latest");
    expect(manifest.dependencies["effect"]).toBe("latest");
  });

  test("template bodies are substituted with the package name and identifier", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills"] });

    expect(contentOf(files, "src/plugin.ts")).toContain("opencode-mytool");
    expect(contentOf(files, "skills/mytool/SKILL.md")).toContain('name: "mytool"');
    expect(contentOf(files, "tests/plugin.contract.test.ts")).toContain("opencode-mytool");
    expect(contentOf(files, "src/plugin.ts")).not.toContain("myextension");
  });

  test("shipping commands adds the starter command and extends the files list", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills", "commands"] });

    expect(contentOf(files, "commands/my-command.md")).toContain("opencode-mytool");
    const manifest = JSON.parse(contentOf(files, "package.json")) as { files: string[]; content: string };
    expect(manifest.files).toEqual(["index.ts", "src", "skills", "commands"]);
    expect(manifest.content).toBe("assets");
  });

  test("shipping a code-backed kind declares code content and lists the directory", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills", "agents"] });

    const manifest = JSON.parse(contentOf(files, "package.json")) as { files: string[]; content: string };
    expect(manifest.content).toBe("code");
    expect(manifest.files).toEqual(["index.ts", "src", "skills", "agents"]);
    expect(pathSet(files)).toContain("agents/.gitkeep");
  });
});
