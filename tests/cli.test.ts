import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedCachedPackage } from "./test-helpers";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_ROOT, "src", "cli.ts");

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
    const blocked = path.join(
      cacheDir,
      "opencode",
      "npm",
      "opencode-architect@latest",
      "1738848000000",
      "node_modules",
      "opencode-architect",
    );
    await mkdir(blocked, { recursive: true });
    await writeFile(path.join(blocked, "index.ts"), "cached");
    const holder = process.platform === "win32"
      ? await spawnCwdHolder(blocked)
      : null;
    if (holder === null) await chmod(blocked, 0o500);
    try {
      const run = await runCli(["install"], dir, { XDG_CACHE_HOME: cacheDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("Registered");
      expect(run.stderr).toContain(`Could not clear cached package ${path.join(cacheDir, "opencode", "npm", "opencode-architect@latest")}`);
      expect(existsSync(path.join(cacheDir, "opencode", "npm", "opencode-architect"))).toBe(false);
    } finally {
      if (holder) holder.kill();
      else await chmod(blocked, 0o700).catch(() => {});
      await rm(dir, { recursive: true, force: true });
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("install with a legacy v1 plugin entry keeps it read-only and advises upgrading", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-"));
    const configPath = path.join(dir, "opencode.json");
    const legacyConfig = '{ "plugin": ["opencode-architect@0.9.0"] }\n';
    await writeFile(configPath, legacyConfig);
    try {
      const run = await runCli(["install"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("Registered");
      expect(run.stderr).toContain("legacy v1");
      expect(run.stderr).toContain('"plugins"');
      expect(await readFile(configPath, "utf-8")).toBe(legacyConfig);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("cli status", () => {
  test("defaults to both scopes and emits an effective verdict", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-"));
    try {
      const run = await runCli(["status"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("local scope:");
      expect(run.stdout).toContain("global scope:");
      expect(run.stdout).toContain("should load:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--scope narrows status to one scope", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-"));
    try {
      const run = await runCli(["status", "--scope", "global"], dir);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("global scope:");
      expect(run.stdout).not.toContain("local scope:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--path resolves another project directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-path-"));
    try {
      await mkdir(path.join(dir, ".opencode"), { recursive: true });
      await writeFile(
        path.join(dir, ".opencode", "opencode.jsonc"),
        '{\n  // other project\n  "plugins": ["opencode-architect@latest"],\n}\n',
      );

      const run = await runCli(["status", "--path", dir]);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("local scope:");
      expect(run.stdout).toContain("opencode-architect@latest");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--path rejects a directory that does not exist", async () => {
    const run = await runCli(["status", "--path", path.join(tmpdir(), "oa-cli-status-missing-xyz")]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("does not exist");
  });

  test("--path and --online are rejected outside the status command", async () => {
    const pathRun = await runCli(["install", "--path", "somewhere"]);

    expect(pathRun.exitCode).toBe(1);
    expect(pathRun.stderr).toContain("--path");

    const onlineRun = await runCli(["clear-cache", "--online"]);

    expect(onlineRun.exitCode).toBe(1);
    expect(onlineRun.stderr).toContain("--online");
  });

  test("a pinned spec answers the verdict without any cached copy", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-pinned-"));
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-pinned-cache-"));
    try {
      await mkdir(path.join(dir, ".opencode"), { recursive: true });
      await writeFile(path.join(dir, ".opencode", "opencode.json"), '{ "plugins": ["opencode-architect@1.0.0"] }\n');

      const run = await runCli(["status"], dir, { XDG_CACHE_HOME: cacheDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("should load: 1.0.0 (pinned spec, local)");
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("status annotates the verdict and shows the copy age when both scopes register", async () => {    const dir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-both-"));
    const configDir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-cfg-"));
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-status-cache-"));
    try {
      await mkdir(path.join(dir, ".opencode"), { recursive: true });
      await writeFile(path.join(dir, ".opencode", "opencode.json"), '{ "plugins": ["opencode-architect@latest"] }\n');
      await mkdir(path.join(configDir, "opencode"), { recursive: true });
      await writeFile(path.join(configDir, "opencode", "opencode.json"), '{ "plugins": ["opencode-architect@latest"] }\n');
      const copy = path.join(
        cacheDir,
        "opencode",
        "npm",
        "opencode-architect@latest",
        "1738848000000",
        "node_modules",
        "opencode-architect",
      );
      await mkdir(copy, { recursive: true });
      await writeFile(path.join(copy, "package.json"), '{ "name": "opencode-architect", "version": "1.0.0" }\n');

      const run = await runCli(["status"], dir, { XDG_CACHE_HOME: cacheDir, XDG_CONFIG_HOME: configDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("local + global");
      expect(run.stdout).toContain("both scopes register");
      expect(run.stdout).toMatch(/resolved=1\.0\.0 \(cache copy, just now\)/);
      expect(run.stderr).toContain("double-load risk");
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});

describe("cli clear-cache", () => {
  const packagesDir = (cacheDir: string) => path.join(cacheDir, "opencode", "npm");
  const seedCache = seedCachedPackage;

  test("default mode removes only this package's cache dirs", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cc-"));
    try {
      const ours = await seedCache(packagesDir(cacheDir), "opencode-architect");
      await seedCache(packagesDir(cacheDir), "opencode-architect@latest");
      const other = await seedCache(packagesDir(cacheDir), "other-pkg");

      const run = await runCli(["clear-cache"], undefined, { XDG_CACHE_HOME: cacheDir });

      expect(run.exitCode).toBe(0);
      expect(existsSync(ours)).toBe(false);
      expect(existsSync(path.join(cacheDir, "opencode", "npm", "opencode-architect@latest"))).toBe(false);
      expect(existsSync(other)).toBe(true);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("--package removes only that package and requires --yes", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cc-"));
    try {
      const target = await seedCache(packagesDir(cacheDir), "some-pkg");
      const ours = await seedCache(packagesDir(cacheDir), "opencode-architect");

      const refused = await runCli(["clear-cache", "--package", "some-pkg"], undefined, { XDG_CACHE_HOME: cacheDir });
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain("--yes");
      expect(existsSync(target)).toBe(true);

      const ok = await runCli(["clear-cache", "--package", "some-pkg", "--yes"], undefined, { XDG_CACHE_HOME: cacheDir });
      expect(ok.exitCode).toBe(0);
      expect(existsSync(target)).toBe(false);
      expect(existsSync(ours)).toBe(true);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("--all removes the whole OpenCode cache dir and requires --yes", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cc-"));
    try {
      await seedCache(packagesDir(cacheDir), "opencode-architect");

      const refused = await runCli(["clear-cache", "--all"], undefined, { XDG_CACHE_HOME: cacheDir });
      expect(refused.exitCode).toBe(1);
      expect(existsSync(path.join(cacheDir, "opencode"))).toBe(true);

      const ok = await runCli(["clear-cache", "--all", "--yes"], undefined, { XDG_CACHE_HOME: cacheDir });
      expect(ok.exitCode).toBe(0);
      expect(existsSync(path.join(cacheDir, "opencode"))).toBe(false);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("--package and --all together exit 1", async () => {
    const run = await runCli(["clear-cache", "--package", "x", "--all", "--yes"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("mutually exclusive");
  });

  test("traversal-y --package values exit 1 without deleting anything", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cc-"));
    try {
      const ours = await seedCache(packagesDir(cacheDir), "opencode-architect");

      const run = await runCli(["clear-cache", "--package", "../escape", "--yes"], undefined, { XDG_CACHE_HOME: cacheDir });

      expect(run.exitCode).toBe(1);
      expect(existsSync(ours)).toBe(true);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("dry-run lists what would be removed without deleting, in every mode", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cc-"));
    try {
      const ours = await seedCache(packagesDir(cacheDir), "opencode-architect");
      const other = await seedCache(packagesDir(cacheDir), "some-pkg");

      const defaultRun = await runCli(["clear-cache", "--dry-run"], undefined, { XDG_CACHE_HOME: cacheDir });
      expect(defaultRun.exitCode).toBe(0);
      expect(defaultRun.stdout).toContain("Would remove");
      expect(defaultRun.stdout).toContain(ours);
      expect(defaultRun.stdout).not.toContain(other);
      expect(existsSync(ours)).toBe(true);
      expect(existsSync(other)).toBe(true);

      const packageRun = await runCli(["clear-cache", "--package", "some-pkg", "--dry-run"], undefined, { XDG_CACHE_HOME: cacheDir });
      expect(packageRun.exitCode).toBe(0);
      expect(packageRun.stdout).toContain(other);
      expect(packageRun.stdout).not.toContain(ours);
      expect(existsSync(other)).toBe(true);

      const allRun = await runCli(["clear-cache", "--all", "--dry-run"], undefined, { XDG_CACHE_HOME: cacheDir });
      expect(allRun.exitCode).toBe(0);
      expect(allRun.stdout).toContain(path.join(cacheDir, "opencode"));
      expect(existsSync(path.join(cacheDir, "opencode"))).toBe(true);

      const emptyDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cc-"));
      try {
        const emptyRun = await runCli(["clear-cache", "--dry-run"], undefined, { XDG_CACHE_HOME: emptyDir });
        expect(emptyRun.exitCode).toBe(0);
        expect(emptyRun.stdout).toContain("nothing to remove");
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("running with nothing cached exits 0", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "oa-cli-cc-"));
    try {
      const run = await runCli(["clear-cache"], undefined, { XDG_CACHE_HOME: cacheDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("nothing to remove");
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("--help lists clear-cache", async () => {
    const run = await runCli(["--help"]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("clear-cache");
  });
});

async function spawnCwdHolder(dir: string): Promise<Bun.Subprocess> {
  const readyFile = path.join(dir, ".holder-ready");
  const holder = Bun.spawn(
    [process.execPath, "-e", "require('node:fs').writeFileSync(process.env.READY_FILE, '1'); setInterval(() => {}, 1e9)"],
    { cwd: dir, env: { ...process.env, READY_FILE: readyFile }, stdout: "ignore", stderr: "ignore" },
  );
  const deadline = Date.now() + 5000;
  while (!existsSync(readyFile)) {
    if (Date.now() > deadline || holder.exitCode !== null) throw new Error("cwd holder failed to start");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return holder;
}
