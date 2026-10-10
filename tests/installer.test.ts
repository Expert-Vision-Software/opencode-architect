import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Installer, contentHash, type Manifest, type Scope } from "../src/installer";
import { CopyModeUnsupportedError } from "../src/copy-mode-unsupported-error";
import { fakeEnvironment } from "./test-helpers";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

let projectDir = "";
let homeDir = "";
let cacheDir = "";
let installer = new Installer();

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "oa-installer-project-"));
  homeDir = await mkdtemp(path.join(tmpdir(), "oa-installer-home-"));
  cacheDir = await mkdtemp(path.join(tmpdir(), "oa-installer-cache-"));
  installer = new Installer(null, rm, isolatedEnvironment());
});

function isolatedEnvironment() {
  return fakeEnvironment({
    vars: { XDG_CONFIG_HOME: homeDir, XDG_CACHE_HOME: cacheDir },
  });
}

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
  await rm(homeDir, { recursive: true, force: true });
  await rm(cacheDir, { recursive: true, force: true });
});

function scopeBase(scope: Scope): string {
  return scope === "local" ? path.join(projectDir, ".opencode") : path.join(homeDir, "opencode");
}

function manifestPath(scope: Scope): string {
  return path.join(scopeBase(scope), "opencode-architect.manifest.json");
}

function legacyManifestPath(scope: Scope): string {
  return path.join(scopeBase(scope), "opencode-architect.json");
}

async function readPackageVersion(): Promise<string> {
  const content = await readFile(path.join(PACKAGE_ROOT, "package.json"), "utf-8");
  return (JSON.parse(content) as { version: string }).version;
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf-8")) as Record<string, unknown>;
}

async function writeJson(filePath: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function install(scope: Scope, options?: Partial<{ force: boolean; mode: "plugin" | "copy" }>) {
  return installer.install(scope, {
    force: options?.force ?? false,
    mode: options?.mode ?? "plugin",
    projectDir,
  });
}

describe("Installer.install", () => {
  test("registers the plugin entry and writes a plugin-mode manifest", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeJson(configPath, { theme: "dark" });

    const outcome = await install("local");

    expect(outcome.action).toBe("installed");
    expect(outcome.configPath).toBe(configPath);
    expect(outcome.manifestPath).toBe(manifestPath("local"));

    const config = await readJson(configPath);
    expect(config.plugins).toEqual(["opencode-architect@latest"]);
    expect(config.theme).toBe("dark");

    const manifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    expect(manifest.version).toBe(await readPackageVersion());
    expect(manifest.mode).toBe("plugin");
    expect(manifest.entry).toBe("opencode-architect@latest");
    expect(manifest.configPath).toBe(configPath);
    expect(manifest["content-hash"]).toBeNull();
  });

  test("a live path-form entry prevents a duplicate npm-name entry", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    const entry = pathToFileURL(PACKAGE_ROOT).href;
    await writeText(configPath, `{ "plugins": ["other", { "package": "${entry}" }] }\n`);
    const before = await readFile(configPath, "utf-8");

    const outcome = await install("local");

    expect(outcome.configAction).toBe("noop");
    expect(await readFile(configPath, "utf-8")).toBe(before);
  });

  test("global install registers in the XDG config base", async () => {
    const outcome = await install("global");

    expect(outcome.configPath).toBe(path.join(scopeBase("global"), "opencode.jsonc"));
    expect(existsSync(manifestPath("global"))).toBe(true);

    const text = await readFile(outcome.configPath as string, "utf-8");
    expect(text).toContain("opencode-architect");
  });

  test("re-running with a matching manifest and entry is a zero-write no-op", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeJson(configPath, {});
    await install("local");
    const manifestBefore = await readFile(manifestPath("local"), "utf-8");
    const configBefore = await readFile(configPath, "utf-8");

    const outcome = await install("local");

    expect(outcome.action).toBe("noop");
    expect(await readFile(manifestPath("local"), "utf-8")).toBe(manifestBefore);
    expect(await readFile(configPath, "utf-8")).toBe(configBefore);
  });

  test("a legacy v1 entry is left read-only with an advisory and never registered twice", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeText(configPath, '{ "plugin": ["opencode-architect@0.9.0"] }\n');
    const before = await readFile(configPath, "utf-8");

    const outcome = await install("local");

    expect(outcome.configAction).toBe("noop");
    expect(outcome.configWarning).toContain("legacy v1");
    expect(outcome.configWarning).toContain('"plugins"');
    expect(await readFile(configPath, "utf-8")).toBe(before);
    expect(outcome.action).toBe("installed");

    const manifestBefore = await readFile(manifestPath("local"), "utf-8");
    const repeat = await install("local");

    expect(repeat.action).toBe("noop");
    expect(repeat.configAction).toBe("noop");
    expect(await readFile(configPath, "utf-8")).toBe(before);
    expect(await readFile(manifestPath("local"), "utf-8")).toBe(manifestBefore);
  });

  test("uninstall leaves a legacy v1 entry untouched and advises", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    const legacyConfig = '{ "plugin": ["opencode-architect"] }\n';
    await writeText(configPath, legacyConfig);

    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.mode).toBe("plugin");
    expect(outcome.pluginRemoved).toBe(false);
    expect(outcome.configPath).toBe(configPath);
    expect(outcome.configWarning).toContain("legacy v1");
    expect(outcome.configWarning).toContain(configPath);
    expect(await readFile(configPath, "utf-8")).toBe(legacyConfig);
  });

  test("an existing entry with a version spec matches semantically without a write", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.jsonc");
    await writeText(
      configPath,
      `{\n  // keep this comment\n  "plugins": ["other", "opencode-architect@latest"],\n}\n`,
    );
    const before = await readFile(configPath, "utf-8");

    const outcome = await install("local");

    expect(outcome.configPath).toBe(configPath);
    expect(outcome.configAction).toBe("noop");
    expect(await readFile(configPath, "utf-8")).toBe(before);
    expect(outcome.action).toBe("installed");
  });

  test("splicing preserves comments and formatting byte-for-byte outside the array", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.jsonc");
    const original = [
      "{",
      "  // my precious comment",
      '  "$schema": "https://opencode.ai/config.json",',
      '  "plugins": [',
      '    // plugin note',
      '    "other-extension",',
      "  ],",
      '  "theme": "dark",',
      "}",
      "",
    ].join("\n");
    await writeText(configPath, original);

    await install("local");

    const after = await readFile(configPath, "utf-8");
    expect(after).toContain("// my precious comment");
    expect(after).toContain("// plugin note");
    expect(after.indexOf("opencode-architect@latest")).toBeLessThan(after.indexOf("other-extension"));
    const withoutEntry = after.replace(`\n    "opencode-architect@latest",`, "");
    expect(withoutEntry).toBe(original);
  });

  test("an unparseable config aborts with nothing written", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    const broken = "{ not json ]";
    await writeText(configPath, broken);

    await expect(install("local")).rejects.toThrow(/could not be parsed/);

    expect(await readFile(configPath, "utf-8")).toBe(broken);
    expect(existsSync(manifestPath("local"))).toBe(false);
  });

  test("no config anywhere creates a default config with the entry", async () => {
    const outcome = await install("local");

    expect(outcome.configAction).toBe("created");
    expect(outcome.configPath).toBe(path.join(projectDir, "opencode.jsonc"));
    const text = await readFile(path.join(projectDir, "opencode.jsonc"), "utf-8");
    expect(text).toContain('"plugins": ["opencode-architect@latest"]');
  });

  test("refuses copy mode with an explanatory error", async () => {
    await expect(install("local", { mode: "copy" })).rejects.toThrow(CopyModeUnsupportedError);
    expect(existsSync(manifestPath("local"))).toBe(false);
  });

  test("fails loudly when bundled assets are absent (partial cache artifact)", async () => {
    const partialCache = await mkdtemp(path.join(tmpdir(), "oa-partial-cache-"));
    try {
      const broken = new Installer(partialCache, rm, isolatedEnvironment());

      await expect(
        broken.install("local", { force: false, mode: "plugin", projectDir }),
      ).rejects.toThrow(/Bundled asset directory missing or empty.*clear-cache/s);

      expect(existsSync(manifestPath("local"))).toBe(false);
    } finally {
      await rm(partialCache, { recursive: true, force: true });
    }
  });

  test("fails loudly when a bundled asset directory is empty", async () => {
    const partialCache = await mkdtemp(path.join(tmpdir(), "oa-partial-cache-"));
    await mkdir(path.join(partialCache, "agents"), { recursive: true });
    try {
      const broken = new Installer(partialCache, rm, isolatedEnvironment());

      await expect(
        broken.install("local", { force: false, mode: "plugin", projectDir }),
      ).rejects.toThrow(/missing or empty.*agents/s);
    } finally {
      await rm(partialCache, { recursive: true, force: true });
    }
  });

  test("migrates a legacy copy install: payload removed per manifest, entry added", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeJson(configPath, {});
    const legacy = {
      version: "0.0.1",
      agentFiles: ["opencode-architect.md"],
      referencesDir: path.join(scopeBase("local"), "opencode-architect", "references"),
      templatesDir: path.join(scopeBase("local"), "opencode-architect", "templates"),
      hashes: [
        { path: path.join("agents", "opencode-architect.md"), hash: "deadbeef" },
        {
          path: path.join("opencode-architect", "references", "agents.md"),
          hash: "feedface",
        },
      ],
    };
    await writeJson(manifestPath("local"), legacy);
    await mkdir(path.join(scopeBase("local"), "agents"), { recursive: true });
    await writeText(path.join(scopeBase("local"), "agents", "opencode-architect.md"), "old agent");
    await mkdir(path.join(scopeBase("local"), "opencode-architect", "references"), { recursive: true });
    await writeText(path.join(scopeBase("local"), "opencode-architect", "references", "agents.md"), "old ref");
    const consumerAgent = path.join(scopeBase("local"), "agents", "consumer-own.md");
    await writeText(consumerAgent, "# consumer's own");

    const outcome = await install("local", { force: true });

    expect(outcome.action).toBe("migrated");
    expect(outcome.removedPayload).toContain(path.join(scopeBase("local"), "agents", "opencode-architect.md"));
    expect(outcome.removedPayload).toContain(
      path.join(scopeBase("local"), "opencode-architect", "references", "agents.md"),
    );
    expect(existsSync(path.join(scopeBase("local"), "agents", "opencode-architect.md"))).toBe(false);
    expect(existsSync(consumerAgent)).toBe(true);
    expect(existsSync(path.join(scopeBase("local"), "opencode-architect"))).toBe(false);

    const config = await readJson(path.join(scopeBase("local"), "opencode.json"));
    expect(config.plugins).toEqual(["opencode-architect@latest"]);
    const manifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    expect(manifest.mode).toBe("plugin");
  });

  test("migration requires --force consent and leaves everything intact without it", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeJson(configPath, {});
    const legacy = {
      version: "0.0.1",
      hashes: [{ path: path.join("agents", "opencode-architect.md"), hash: "deadbeef" }],
    };
    await writeJson(manifestPath("local"), legacy);
    await mkdir(path.join(scopeBase("local"), "agents"), { recursive: true });
    await writeText(path.join(scopeBase("local"), "agents", "opencode-architect.md"), "old agent");

    await expect(install("local")).rejects.toThrow(/--force/);

    expect(existsSync(path.join(scopeBase("local"), "agents", "opencode-architect.md"))).toBe(true);
    expect(existsSync(manifestPath("local"))).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    const config = await readJson(configPath);
    expect(config.plugins).toBeUndefined();
  });

  test("migration aborts with the payload intact when a config is unparseable", async () => {
    const legacy = {
      version: "0.0.1",
      hashes: [{ path: path.join("agents", "opencode-architect.md"), hash: "deadbeef" }],
    };
    await writeJson(manifestPath("local"), legacy);
    await mkdir(path.join(scopeBase("local"), "agents"), { recursive: true });
    await writeText(path.join(scopeBase("local"), "agents", "opencode-architect.md"), "old agent");
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeText(configPath, "{ broken ]");

    await expect(install("local", { force: true })).rejects.toThrow(/could not be parsed/);

    expect(existsSync(path.join(scopeBase("local"), "agents", "opencode-architect.md"))).toBe(true);
    expect(existsSync(manifestPath("local"))).toBe(true);
  });

  test("force re-registers and rewrites an up-to-date manifest", async () => {
    await install("local");
    const manifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    manifest.version = "0.0.1";
    await writeFile(manifestPath("local"), JSON.stringify(manifest, null, 2));

    const outcome = await install("local", { force: true });

    expect(outcome.action).toBe("upgraded");
    expect(((await readJson(manifestPath("local"))) as unknown as Manifest).version).toBe(
      await readPackageVersion(),
    );
  });

  test("a removed plugin entry is not up to date: install re-registers", async () => {
    await install("local");
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeJson(configPath, { theme: "dark" });

    const outcome = await install("local");

    expect(outcome.action).toBe("upgraded");
    const config = await readJson(configPath);
    expect(config.plugins).toEqual(["opencode-architect@latest"]);
    const manifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    expect(manifest.version).toBe(await readPackageVersion());
  });

  test("re-registering one scope leaves the other scope untouched", async () => {
    await install("local");
    await install("global");
    const globalConfigPath = path.join(scopeBase("global"), "opencode.jsonc");
    const globalConfigBefore = await readFile(globalConfigPath, "utf-8");
    const globalManifestBefore = await readFile(manifestPath("global"), "utf-8");

    await install("local", { force: true });

    expect(await readFile(globalConfigPath, "utf-8")).toBe(globalConfigBefore);
    expect(await readFile(manifestPath("global"), "utf-8")).toBe(globalManifestBefore);
  });

  test("relocates a manifest left at the legacy name on the next install", async () => {
    await install("local");
    await rename(manifestPath("local"), legacyManifestPath("local"));

    const outcome = await install("local");

    expect(outcome.action).toBe("noop");
    expect(existsSync(manifestPath("local"))).toBe(true);
    expect(existsSync(legacyManifestPath("local"))).toBe(false);
    const manifestState = await installer.manifestAt("local", projectDir);
    expect(manifestState?.version).toBe(await readPackageVersion());
  });

  test("uninstall removes manifests left at either name", async () => {
    await install("local");
    await rename(manifestPath("local"), legacyManifestPath("local"));

    await installer.uninstall("local", projectDir);

    expect(existsSync(manifestPath("local"))).toBe(false);
    expect(existsSync(legacyManifestPath("local"))).toBe(false);
  });
});

describe("Installer.install cache pruning", () => {
  function cacheRoot(): string {
    return path.join(cacheDir, "opencode", "npm");
  }

  async function seedCache(): Promise<void> {
    const version = await readPackageVersion();
    for (const name of [
      "opencode-architect",
      "opencode-architect@latest",
      `opencode-architect@${version}`,
      "opencode-architect@0.6.0",
      "other-package",
    ]) {
      const generation = path.join(cacheRoot(), name, "1738848000000", "node_modules", name.replace(/@.*$/, ""));
      await mkdir(generation, { recursive: true });
      await writeFile(path.join(generation, "index.ts"), "cached");
    }
  }

  test("removes stale non-pinned key dirs and preserves pinned and foreign keys", async () => {
    await seedCache();
    const version = await readPackageVersion();

    const outcome = await install("local");

    expect(outcome.clearedCache).toEqual([
      path.join(cacheRoot(), "opencode-architect"),
      path.join(cacheRoot(), "opencode-architect@latest"),
      path.join(cacheRoot(), `opencode-architect@${version}`),
    ]);
    expect(outcome.cacheWarnings).toEqual([]);
    expect(existsSync(path.join(cacheRoot(), "opencode-architect"))).toBe(false);
    expect(existsSync(path.join(cacheRoot(), "opencode-architect@latest"))).toBe(false);
    expect(existsSync(path.join(cacheRoot(), `opencode-architect@${version}`))).toBe(false);
    expect(existsSync(path.join(cacheRoot(), "opencode-architect@0.6.0"))).toBe(true);
    expect(existsSync(path.join(cacheRoot(), "other-package"))).toBe(true);
  });

  test("a removed key takes every cached generation with it", async () => {
    await seedCache();

    await install("local");

    expect(existsSync(path.join(cacheRoot(), "opencode-architect@latest", "1738848000000"))).toBe(false);
  });

  test("prunes even when the install is a no-op", async () => {
    await install("local");
    await seedCache();
    const version = await readPackageVersion();

    const outcome = await install("local");

    expect(outcome.action).toBe("noop");
    expect(outcome.clearedCache).toEqual([
      path.join(cacheRoot(), "opencode-architect"),
      path.join(cacheRoot(), "opencode-architect@latest"),
      path.join(cacheRoot(), `opencode-architect@${version}`),
    ]);
    expect(await readdir(cacheRoot())).toEqual(
      expect.arrayContaining(["opencode-architect@0.6.0", "other-package"]),
    );
    expect(await readdir(cacheRoot())).toHaveLength(2);
  });

  test("removal failure warns but the install still succeeds", async () => {
    await seedCache();
    const blocked = path.join(cacheRoot(), "opencode-architect@latest");
    const failingInstaller = new Installer(null, async (target, options) => {
      if (target === blocked) throw new Error("EPERM: simulated removal failure");
      await rm(target, options);
    }, isolatedEnvironment());

    const outcome = await failingInstaller.install("local", { force: false, mode: "plugin", projectDir });

    expect(outcome.action).toBe("installed");
    expect(outcome.cacheWarnings).toHaveLength(1);
    expect(outcome.cacheWarnings[0]).toContain(blocked);
    expect(existsSync(path.join(cacheRoot(), "opencode-architect"))).toBe(false);
    expect(existsSync(blocked)).toBe(true);
  });

  test("cache root honors XDG_CACHE_HOME with no cache present", async () => {
    const outcome = await install("local");
    expect(outcome.clearedCache).toEqual([]);
    expect(outcome.cacheWarnings).toEqual([]);
  });
});

describe("Installer.uninstall", () => {
  test("plugin mode removes the entry and the manifest", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeJson(configPath, {});
    await install("local");
    const before = await readFile(configPath, "utf-8");

    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.mode).toBe("plugin");
    expect(outcome.pluginRemoved).toBe(true);
    expect(outcome.configPath).toBe(configPath);
    expect(existsSync(manifestPath("local"))).toBe(false);
    const config = await readJson(configPath);
    expect(config.plugins).toEqual([]);
    expect((await readFile(configPath, "utf-8")).length).toBeLessThan(before.length);
  });

  test("legacy copy uninstall removes exactly the manifest files and keeps consumer files", async () => {
    const legacy = {
      version: "0.0.1",
      agentFiles: [],
      referencesDir: "",
      templatesDir: "",
      hashes: [{ path: path.join("agents", "opencode-architect.md"), hash: "deadbeef" }],
    };
    await writeJson(manifestPath("local"), legacy);
    await mkdir(path.join(scopeBase("local"), "agents"), { recursive: true });
    await writeText(path.join(scopeBase("local"), "agents", "opencode-architect.md"), "old agent");
    const consumerAgent = path.join(scopeBase("local"), "agents", "consumer-own.md");
    await writeText(consumerAgent, "# consumer's own");

    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.mode).toBe("copy");
    expect(outcome.removed).toContain(path.join(scopeBase("local"), "agents", "opencode-architect.md"));
    expect(outcome.removed).toContain(manifestPath("local"));
    expect(existsSync(consumerAgent)).toBe(true);
  });

  test("uninstall without a manifest sweeps residual legacy payload and keeps consumer files", async () => {
    await mkdir(path.join(scopeBase("local"), "agents"), { recursive: true });
    await writeText(path.join(scopeBase("local"), "agents", "opencode-architect.md"), "old agent");
    const consumerAgent = path.join(scopeBase("local"), "agents", "consumer-own.md");
    await writeText(consumerAgent, "# consumer's own");
    const packageDir = path.join(scopeBase("local"), "opencode-architect", "references");
    await mkdir(packageDir, { recursive: true });
    await writeText(path.join(packageDir, "agents.md"), "old ref");

    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.removed).toContain(path.join(scopeBase("local"), "agents", "opencode-architect.md"));
    expect(outcome.removed).toContain(path.join(scopeBase("local"), "opencode-architect"));
    expect(existsSync(consumerAgent)).toBe(true);
    expect(existsSync(path.join(scopeBase("local"), "opencode-architect"))).toBe(false);
  });

  test("uninstall with nothing installed is a no-op", async () => {
    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.mode).toBe("none");
    expect(outcome.removed).toEqual([]);
    expect(outcome.pluginRemoved).toBe(false);
  });

  test("uninstall aborts untouched on an unparseable config with the entry", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeText(configPath, "{ plugin: [broken");
    const legacy = {
      version: "0.0.1",
      agentFiles: [],
      referencesDir: "",
      templatesDir: "",
      hashes: [{ path: path.join("agents", "opencode-architect.md"), hash: "deadbeef" }],
    };
    await writeJson(manifestPath("local"), legacy);
    await mkdir(path.join(scopeBase("local"), "agents"), { recursive: true });
    await writeText(path.join(scopeBase("local"), "agents", "opencode-architect.md"), "old agent");

    await expect(installer.uninstall("local", projectDir)).rejects.toThrow(/could not be parsed/);

    expect(existsSync(manifestPath("local"))).toBe(true);
    expect(existsSync(path.join(scopeBase("local"), "agents", "opencode-architect.md"))).toBe(true);
  });
});

describe("contentHash", () => {
  test("produces a stable hex digest for a directory", async () => {
    const dir = path.join(projectDir, "payload");
    await mkdir(dir);
    await writeFile(path.join(dir, "a.txt"), "hello");

    const first = await contentHash(dir);
    const second = await contentHash(dir);

    expect(first).toMatch(/^[0-9a-f]+$/);
    expect(first).toBe(second);
  });
});
