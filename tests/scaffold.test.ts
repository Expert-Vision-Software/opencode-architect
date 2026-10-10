import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ScaffoldRenderer, type RenderedFile } from "../src/scaffold/renderer";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_ROOT, "src", "cli.ts");

async function runCli(args: string[], cwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI_PATH, ...args], {
    cwd: cwd ?? PACKAGE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

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

describe("scaffold command (fresh)", () => {
  test("flag-driven fresh scaffold writes the conformant tree into the workspace", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-scaffold-"));
    try {
      const run = await runCli(["scaffold", "--name", "opencode-mytool"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("opencode-mytool");
      const manifest = JSON.parse(await readFile(path.join(dir, "opencode-mytool", "package.json"), "utf-8")) as {
        name: string;
        content: string;
        bin: Record<string, string>;
      };
      expect(manifest.name).toBe("opencode-mytool");
      expect(manifest.bin["opencode-mytool"]).toBe("src/cli.ts");
      expect(existsSync(path.join(dir, "opencode-mytool", "src", "plugin.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "opencode-mytool", "skills", "mytool", "SKILL.md"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a missing package name in a non-interactive session fails with guidance", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-scaffold-"));
    try {
      const run = await runCli(["scaffold"], dir);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("--name");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("an invalid ship kind is rejected", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-scaffold-"));
    try {
      const run = await runCli(["scaffold", "--name", "opencode-mytool", "--ship", "gadgets"], dir);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("gadgets");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("an existing target package directory is refused", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-scaffold-"));
    try {
      await mkdir(path.join(dir, "opencode-mytool"), { recursive: true });
      const run = await runCli(["scaffold", "--name", "opencode-mytool"], dir);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("already exists");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
