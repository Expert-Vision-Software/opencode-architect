import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ScaffoldRenderer, type RenderedFile } from "../src/scaffold/renderer";
import { sha256 } from "../src/core/manifest";
import { Promoter } from "../src/scaffold/promoter";

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
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills"], coreDependency: "file:../opencode-architect" });

    expect(pathSet(files)).toEqual(
      [
        "index.ts",
        "src/cli.ts",
        "src/installer.ts",
        "src/plugin.ts",
        "commands/my-command.md",
        "package.json",
        "skills/mytool/SKILL.md",
        "tests/plugin.contract.test.ts",
        "tsconfig.json",
      ].sort(),
    );
  });

  test("the package manifest carries the derived name, bin, files, and assets content", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills"], coreDependency: "file:../opencode-architect" });
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
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills"], coreDependency: "file:../opencode-architect" });

    expect(contentOf(files, "src/plugin.ts")).toContain("opencode-mytool");
    expect(contentOf(files, "skills/mytool/SKILL.md")).toContain('name: "mytool"');
    expect(contentOf(files, "tests/plugin.contract.test.ts")).toContain("opencode-mytool");
    expect(contentOf(files, "src/plugin.ts")).not.toContain("myextension");
  });

  test("shipping agents declares code content and lists the directory", () => {
    const files = new ScaffoldRenderer().render({ name: "opencode-mytool", ship: ["skills", "agents"], coreDependency: "file:../opencode-architect" });

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
        dependencies: Record<string, string>;
      };
      expect(manifest.name).toBe("opencode-mytool");
      expect(manifest.content).toBe("assets");
      // The machinery comes from the core dependency, linked locally (ADR-0013).
      expect(manifest.dependencies["opencode-architect"]).toMatch(/^file:/);
      expect(existsSync(path.join(dir, "opencode-mytool", "node_modules", "opencode-architect"))).toBe(true);
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

  test("promote --yes deletes the source package.json, lockfile, and node_modules with the originals", async () => {
    const dir = await promoteFixture();
    await writeFile(path.join(dir, ".opencode", "package.json"), '{}\n');
    await writeFile(path.join(dir, ".opencode", "bun.lock"), "");
    await mkdir(path.join(dir, ".opencode", "node_modules", "left-pad"), { recursive: true });
    await writeFile(path.join(dir, ".opencode", "node_modules", "left-pad", "index.js"), "module.exports = {};\n");
    try {
      const run = await runCli(["scaffold", "--promote", "--name", "opencode-mytool", "--yes"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("Removed: package.json");
      expect(run.stdout).toContain("Removed: bun.lock");
      expect(run.stdout).toContain("Removed: node_modules");
      expect(existsSync(path.join(dir, ".opencode", "package.json"))).toBe(false);
      expect(existsSync(path.join(dir, ".opencode", "bun.lock"))).toBe(false);
      expect(existsSync(path.join(dir, ".opencode", "node_modules"))).toBe(false);
      expect(existsSync(path.join(dir, ".opencode", "opencode-mytool.manifest.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test("without consent the source artifacts are listed for removal but kept", async () => {
    const dir = await promoteFixture();
    await writeFile(path.join(dir, ".opencode", "package.json"), '{}\n');
    try {
      const run = await runCli(["scaffold", "--promote", "--name", "opencode-mytool"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("Would remove: package.json");
      expect(existsSync(path.join(dir, ".opencode", "package.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test("a sibling target holding an existing package is refused with merge routing", async () => {
    const dir = await promoteFixture();
    const name = `opencode-sib-${Math.random().toString(36).slice(2, 8)}`;
    const sibling = path.join(path.dirname(dir), name);
    await mkdir(sibling, { recursive: true });
    await writeFile(path.join(sibling, "package.json"), '{}\n');
    try {
      const run = await runCli(["scaffold", "--promote", "--name", name, "--target", "sibling"], dir);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("packager");
      expect(run.stderr).toContain("merge");
      expect(existsSync(path.join(dir, ".opencode", "skills", "alpha", "SKILL.md"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(sibling, { recursive: true, force: true });
    }
  }, 60_000);

  test("verifyPayload fails on a manifest hash mismatch and passes on matching content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-verify-"));
    try {
      await mkdir(path.join(dir, ".opencode", "skills", "alpha"), { recursive: true });
      const skillPath = path.join(dir, ".opencode", "skills", "alpha", "SKILL.md");
      await writeFile(skillPath, "---\nname: \"alpha\"\n---\n\nalpha.\n");
      await writeFile(
        path.join(dir, ".opencode", "opencode.json"),
        JSON.stringify({ plugins: ["opencode-mytool@latest"] }),
      );
      await writeFile(
        path.join(dir, ".opencode", "opencode-mytool.manifest.json"),
        JSON.stringify({ version: "0.1.0", mode: "copy", files: { "skills/alpha/SKILL.md": await sha256(skillPath) } }),
      );
      const promoter = new Promoter();

      expect(await promoter.verifyPayload(dir, "opencode-mytool")).toBeNull();

      await writeFile(skillPath, "---\nname: \"alpha\"\n---\n\nconsumer-edited.\n");
      const mismatch = await promoter.verifyPayload(dir, "opencode-mytool");
      expect(mismatch).toContain("hash mismatch");
      expect(mismatch).toContain("skills/alpha/SKILL.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("the removal plan lists a non-identical copy-mode original for removal and an identical one as managed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-removal-"));
    try {
      await mkdir(path.join(dir, ".opencode", "skills", "alpha"), { recursive: true });
      const original = path.join(dir, ".opencode", "skills", "alpha", "SKILL.md");
      await writeFile(original, "original content\n");
      await mkdir(path.join(dir, "pkg", "skills", "alpha"), { recursive: true });
      await writeFile(path.join(dir, "pkg", "skills", "alpha", "SKILL.md"), "original content\n");
      await mkdir(path.join(dir, ".opencode", "skills", "beta"), { recursive: true });
      const modified = path.join(dir, ".opencode", "skills", "beta", "SKILL.md");
      await writeFile(modified, "consumer-modified content\n");
      await mkdir(path.join(dir, "pkg", "skills", "beta"), { recursive: true });
      await writeFile(path.join(dir, "pkg", "skills", "beta", "SKILL.md"), "packaged content\n");

      const plan = await new Promoter().removalPlan(
        path.join(dir, ".opencode"),
        path.join(dir, "pkg"),
        [
          { sourcePath: original, relativePath: "skills/alpha/SKILL.md" },
          { sourcePath: modified, relativePath: "skills/beta/SKILL.md" },
        ],
        "copy",
      );

      expect(plan.managed).toContain("skills/alpha/SKILL.md");
      expect(plan.removable).toContain("skills/beta/SKILL.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
