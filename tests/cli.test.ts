import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_ROOT, "cli.ts");

interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd?: string, env?: Record<string, string>): Promise<CliRun> {
  const proc = Bun.spawn([process.execPath, CLI_PATH, ...args], {
    cwd: cwd ?? PACKAGE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: env ? { ...process.env, ...env } : undefined,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe("cli", () => {
  test("no arguments prints help and exits 0", async () => {
    const run = await runCli([]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("install");
    expect(run.stdout).toContain("uninstall");
    expect(run.stdout).toContain("status");
  });

  test("--version prints the package version and exits 0", async () => {
    const packageJson = JSON.parse(
      await Bun.file(path.join(PACKAGE_ROOT, "package.json")).text(),
    ) as { version: string };

    const run = await runCli(["--version"]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain(packageJson.version);
  });

  test("unknown command exits 1", async () => {
    const run = await runCli(["bogus"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Unknown command");
  });

  test("--mode copy is refused with an explanatory error", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-"));
    try {
      const run = await runCli(["install", "--mode", "copy"], dir);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("code-backed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("install in a scratch project registers the plugin and status reports it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-"));
    try {
      const installRun = await runCli(["install"], dir);

      expect(installRun.exitCode).toBe(0);
      expect(installRun.stdout).toContain("Registered");
      expect(installRun.stdout).toContain("opencode.jsonc");

      const statusRun = await runCli(["status"], dir);

      expect(statusRun.exitCode).toBe(0);
      expect(statusRun.stdout).toContain("mode=plugin");

      const uninstallRun = await runCli(["uninstall"], dir);

      expect(uninstallRun.exitCode).toBe(0);
      expect(uninstallRun.stdout).toContain("Uninstalled");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a cache-clearing failure warns but install exits 0", async () => {
    if (process.getuid?.() === 0) return;
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-"));
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cache-"));
    const blocked = path.join(cacheDir, "opencode", "packages", "opencode-architect@latest", "nested");
    await mkdir(blocked, { recursive: true });
    await writeFile(path.join(blocked, "file.txt"), "cached");
    await chmod(blocked, 0o500);
    try {
      const run = await runCli(["install"], dir, { XDG_CACHE_HOME: cacheDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("Registered");
      expect(run.stderr).toContain(`Could not clear cached package ${path.join(cacheDir, "opencode", "packages", "opencode-architect@latest")}`);
      expect(existsSync(path.join(cacheDir, "opencode", "packages", "opencode-architect"))).toBe(false);
    } finally {
      await chmod(blocked, 0o700);
      await rm(dir, { recursive: true, force: true });
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
