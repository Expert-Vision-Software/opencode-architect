import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { OpencodeArchitectPlugin } from "../index";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const REAL_AGENTS_DIR = path.join(REPO_ROOT, "assets", "agents");
const REAL_ASSETS_DIR = path.join(REPO_ROOT, "assets");

type PluginHooks = Awaited<ReturnType<Plugin>>;

async function hooksFrom(plugin: Plugin): Promise<PluginHooks> {
  const build = plugin as unknown as () => Promise<PluginHooks>;
  return build();
}

async function configFrom(plugin: Plugin): Promise<Config> {
  const hooks = await hooksFrom(plugin);
  const register = hooks.config;
  if (!register) throw new Error("missing config hook");
  const config = {} as Config;
  await register(config);
  return config;
}

function pluginWith(agentsDir: string, assetsDir: string): Plugin {
  return new OpencodeArchitectPlugin(agentsDir, assetsDir).toPlugin();
}

async function makeScratchDirs(): Promise<{ agentsDir: string; assetsDir: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-architect-hook-"));
  const agentsDir = path.join(root, "agents");
  const assetsDir = path.join(root, "assets");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  return { agentsDir, assetsDir };
}

describe("plugin load hook (startup non-interference)", () => {
  let warnSpy: ReturnType<typeof spyOn> | null = null;

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = null;
  });

  function captureWarnings(): string[] {
    const warnings: string[] = [];
    warnSpy = spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    return warnings;
  }

  test("missing bundled agents degrade to exactly one advisory instead of throwing", async () => {
    const { agentsDir, assetsDir } = await makeScratchDirs();
    const warnings = captureWarnings();
    const plugin = pluginWith(agentsDir, assetsDir);

    const config = await configFrom(plugin);

    expect(Object.keys(config.agent ?? {})).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("bunx opencode-architect clear-cache");
    expect(warnings[0]).toContain(`~/.cache/opencode/packages/opencode-architect@`);
    expect(warnings[0]).toContain("ENOENT");
  });

  test("the advisory fallback keeps a package-qualified cache path with a literal version placeholder", async () => {
    const { agentsDir, assetsDir } = await makeScratchDirs();
    const warnings = captureWarnings();
    const plugin = new OpencodeArchitectPlugin(agentsDir, assetsDir, async () => {
      throw new Error("unreadable package metadata");
    });

    await configFrom(plugin.toPlugin());

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("opencode-architect@<version>");
    expect(warnings[0]).toContain("Cause: ENOENT");
  });

  test("repeated failing invocations emit exactly one advisory", async () => {
    const { agentsDir, assetsDir } = await makeScratchDirs();
    const warnings = captureWarnings();
    const plugin = pluginWith(agentsDir, assetsDir);

    await configFrom(plugin);
    await configFrom(plugin);
    await configFrom(plugin);

    expect(warnings).toHaveLength(1);
  });

  test("healthy assets register the agent suite in-memory with no warning", async () => {
    const warnings = captureWarnings();
    const plugin = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => true);
    const config = await configFrom(plugin.toPlugin());

    expect(Object.keys(config.agent ?? {}).length).toBe(10);
    expect(Object.keys(config.permission?.external_directory ?? {}).length).toBeGreaterThan(0);
    expect(warnings).toEqual([]);
  });
});

describe("not-installed advisory (D5)", () => {
  let logSpy: ReturnType<typeof spyOn> | null = null;
  let warnSpy: ReturnType<typeof spyOn> | null = null;

  afterEach(() => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    logSpy = null;
    warnSpy = null;
  });

  function captureOutput(): { logs: string[]; warnings: string[] } {
    const logs: string[] = [];
    const warnings: string[] = [];
    logSpy = spyOn(console, "log").mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    warnSpy = spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    return { logs, warnings };
  }

  test("fires once when no scope holds an install, then stays suppressed", async () => {
    const { logs } = captureOutput();
    let installed = false;
    const plugin = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => installed);

    await configFrom(plugin.toPlugin());
    await configFrom(plugin.toPlugin());

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Not installed in any scope");
    expect(logs[0]).toContain("bunx opencode-architect install --scope global");

    installed = true;
    await configFrom(plugin.toPlugin());
    expect(logs).toHaveLength(1);
  });

  test("fires independently of the failure advisory (separate once-guards)", async () => {
    const { logs, warnings } = captureOutput();
    const failing = new OpencodeArchitectPlugin(
      path.join(tmpdir(), "missing-agents-"),
      path.join(tmpdir(), "missing-assets-"),
    );
    await configFrom(failing.toPlugin());
    expect(warnings).toHaveLength(1);

    const healthy = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => false);
    await configFrom(healthy.toPlugin());

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Not installed in any scope");
  });

  test("never fires when a scope already holds an install", async () => {
    const { logs } = captureOutput();
    const plugin = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => true);

    await configFrom(plugin.toPlugin());
    await configFrom(plugin.toPlugin());

    expect(logs).toEqual([]);
  });
});
