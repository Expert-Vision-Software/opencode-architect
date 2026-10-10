import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
        "commands/my-command.md",
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
    expect(manifest.files).toEqual(["index.ts", "src", "skills", "commands"]);
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

  test("shipping agents declares code content and lists the directory", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills", "agents"] });

    const manifest = JSON.parse(contentOf(files, "package.json")) as { files: string[]; content: string };
    expect(manifest.content).toBe("code");
    expect(manifest.files).toEqual(["index.ts", "src", "skills", "commands", "agents"]);
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

async function writeSkill(dir: string, name: string): Promise<void> {
  await mkdir(path.join(dir, ".opencode", "skills", name), { recursive: true });
  await writeFile(
    path.join(dir, ".opencode", "skills", name, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n${name} workflow.\n`,
  );
}

async function promoteFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "oa-promote-"));
  await writeSkill(dir, "alpha");
  await writeSkill(dir, "beta");
  await mkdir(path.join(dir, ".opencode", "commands"), { recursive: true });
  await writeFile(
    path.join(dir, ".opencode", "commands", "hello.md"),
    '---\ndescription: "Hello command."\n---\n\nSay hello.\n',
  );
  return dir;
}

describe("scaffold command (promote)", () => {
  test("promote packages .opencode extensions, ensures the config reference, and gates retirement", async () => {
    const dir = await promoteFixture();
    try {
      const run = await runCli(["scaffold", "--promote", "--name", "opencode-mytool"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("Already managed");
      expect(run.stdout).toContain("Retirement needs your consent");
      const config = await readFile(path.join(dir, "opencode.jsonc"), "utf-8");
      expect(config).toContain("opencode-mytool");
      const manifest = JSON.parse(await readFile(path.join(dir, "opencode-mytool", "package.json"), "utf-8")) as {
        name: string;
        content: string;
      };
      expect(manifest.name).toBe("opencode-mytool");
      expect(manifest.content).toBe("assets");
      expect(existsSync(path.join(dir, "opencode-mytool", "skills", "alpha", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(dir, "opencode-mytool", "skills", "beta", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(dir, ".opencode", "skills", "alpha", "SKILL.md"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test("promote --yes retires the sources to the managed end state", async () => {
    const dir = await promoteFixture();
    try {
      const run = await runCli(["scaffold", "--promote", "--name", "opencode-mytool", "--yes"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("Already managed");
      const managedSkill = await readFile(
        path.join(dir, "opencode-mytool", "skills", "alpha", "SKILL.md"),
        "utf-8",
      );
      const installedSkill = await readFile(path.join(dir, ".opencode", "skills", "alpha", "SKILL.md"), "utf-8");
      expect(installedSkill).toBe(managedSkill);
      const entries = await readdir(path.join(dir, ".opencode"));
      expect(entries).toContain("opencode-mytool.manifest.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test("a code-backed promote retires .opencode to the manifest only", async () => {
    const dir = await promoteFixture();
    await mkdir(path.join(dir, ".opencode", "agents"), { recursive: true });
    await writeFile(
      path.join(dir, ".opencode", "agents", "researcher.md"),
      '---\ndescription: "Researcher agent."\nmode: subagent\n---\n\nResearch things.\n',
    );
    try {
      const run = await runCli(["scaffold", "--promote", "--name", "opencode-mytool", "--yes"], dir);

      expect(run.exitCode).toBe(0);
      const manifest = JSON.parse(await readFile(path.join(dir, "opencode-mytool", "package.json"), "utf-8")) as {
        content: string;
      };
      expect(manifest.content).toBe("code");
      expect(await readdir(path.join(dir, ".opencode"))).toEqual(["opencode-mytool.manifest.json"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test("an unestablishable config reference aborts retirement with the source in place", async () => {
    const dir = await promoteFixture();
    await writeFile(path.join(dir, ".opencode", "opencode.json"), "{ not json");
    try {
      const run = await runCli(["scaffold", "--promote", "--name", "opencode-mytool", "--yes"], dir);

      expect(run.exitCode).toBe(1);
      expect(existsSync(path.join(dir, ".opencode", "skills", "alpha", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(dir, ".opencode", "skills", "beta", "SKILL.md"))).toBe(true);
      expect(run.stderr).toContain("config reference");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
