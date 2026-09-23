import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Installer, contentHash, type Manifest, type Scope } from "../installer";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

let projectDir = "";
let homeDir = "";
let originalXdg: string | undefined;
const installer = new Installer();

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "oa-installer-project-"));
  homeDir = await mkdtemp(path.join(tmpdir(), "oa-installer-home-"));
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = homeDir;
});

afterEach(async () => {
  if (originalXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdg;
  }
  await rm(projectDir, { recursive: true, force: true });
  await rm(homeDir, { recursive: true, force: true });
});

function scopeBase(scope: Scope): string {
  return scope === "local" ? path.join(projectDir, ".opencode") : path.join(homeDir, "opencode");
}

function manifestPath(scope: Scope): string {
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
    expect(config.plugin).toEqual(["opencode-architect"]);
    expect(config.theme).toBe("dark");

    const manifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    expect(manifest.version).toBe(await readPackageVersion());
    expect(manifest.mode).toBe("plugin");
    expect(manifest.entry).toBe("opencode-architect");
    expect(manifest.configPath).toBe(configPath);
    expect(manifest["content-hash"]).toBeNull();
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

  test("an existing entry with a version spec matches semantically without a write", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.jsonc");
    await writeText(
      configPath,
      `{\n  // keep this comment\n  "plugin": ["other", "opencode-architect@latest"],\n}\n`,
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
      '  "plugin": [',
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
    expect(after.indexOf("opencode-architect")).toBeLessThan(after.indexOf("other-extension"));
    const withoutEntry = after.replace(`\n    "opencode-architect",`, "");
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
    expect(text).toContain('"plugin": ["opencode-architect"]');
  });

  test("refuses copy mode with an explanatory error", async () => {
    await expect(install("local", { mode: "copy" })).rejects.toThrow(/code-backed/);
    expect(existsSync(manifestPath("local"))).toBe(false);
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

    const outcome = await install("local");

    expect(outcome.action).toBe("migrated");
    expect(outcome.removedPayload).toContain(path.join(scopeBase("local"), "agents", "opencode-architect.md"));
    expect(outcome.removedPayload).toContain(
      path.join(scopeBase("local"), "opencode-architect", "references", "agents.md"),
    );
    expect(existsSync(path.join(scopeBase("local"), "agents", "opencode-architect.md"))).toBe(false);
    expect(existsSync(consumerAgent)).toBe(true);
    expect(existsSync(path.join(scopeBase("local"), "opencode-architect"))).toBe(false);

    const config = await readJson(path.join(scopeBase("local"), "opencode.json"));
    expect(config.plugin).toEqual(["opencode-architect"]);
    const manifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    expect(manifest.mode).toBe("plugin");
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

    await expect(install("local")).rejects.toThrow(/could not be parsed/);

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
    expect(config.plugin).toEqual([]);
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

describe("Installer.status", () => {
  test("reports none for an empty scope", async () => {
    const outcome = await installer.status("local", projectDir);

    expect(outcome.mode).toBe("none");
    expect(outcome.version).toBeNull();
    expect(outcome.configPath).toBeNull();
  });

  test("reports plugin mode with version and registration file", async () => {
    const configPath = path.join(scopeBase("local"), "opencode.json");
    await writeJson(configPath, {});
    await install("local");

    const outcome = await installer.status("local", projectDir);

    expect(outcome.mode).toBe("plugin");
    expect(outcome.version).toBe(await readPackageVersion());
    expect(outcome.configPath).toBe(configPath);
  });

  test("detects a registration without a manifest", async () => {
    await writeJson(path.join(scopeBase("local"), "opencode.json"), {
      plugin: ["opencode-architect"],
    });

    const outcome = await installer.status("local", projectDir);

    expect(outcome.mode).toBe("plugin");
    expect(outcome.version).toBeNull();
    expect(outcome.configPath).toBe(path.join(scopeBase("local"), "opencode.json"));
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
