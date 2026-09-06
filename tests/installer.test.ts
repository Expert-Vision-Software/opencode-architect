import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AGENT_FILENAMES, RELATIVE_REFERENCE_REGEX } from "../agent-loader";
import { Installer, rewriteReferencePaths, type Manifest, type Scope } from "../installer";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_AGENTS_DIR = path.join(PACKAGE_ROOT, "assets", "agents");
const SOURCE_REFERENCES_DIR = path.join(PACKAGE_ROOT, "assets", "references");
const SOURCE_TEMPLATES_DIR = path.join(PACKAGE_ROOT, "assets", "templates");
const ABSOLUTE_PATH_REGEX = /`([A-Za-z]:[\\/][^`]+|\/[^`]+)`/g;

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

async function sourceReferenceNames(): Promise<string[]> {
  const entries = await readdir(SOURCE_REFERENCES_DIR);
  return entries.filter((name) => name.endsWith(".md")).sort();
}

async function sourceTemplateNames(): Promise<string[]> {
  return (await readdir(SOURCE_TEMPLATES_DIR)).sort();
}

async function sha256(filePath: string): Promise<string> {
  return sha256Text(await readFile(filePath, "utf-8"));
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("Installer.install", () => {
  test("local install lays out agents, references, and manifest", async () => {
    const outcome = await installer.install("local", { force: false, projectDir });

    expect(outcome.action).toBe("installed");
    expect(outcome.scope).toBe("local");
    expect(outcome.agentsDir).toBe(path.join(scopeBase("local"), "agents"));
    expect(outcome.referencesDir).toBe(
      path.join(scopeBase("local"), "opencode-architect", "references"),
    );
    expect(outcome.templatesDir).toBe(
      path.join(scopeBase("local"), "opencode-architect", "templates"),
    );
    expect(outcome.manifestPath).toBe(manifestPath("local"));

    const installedAgents = (await readdir(outcome.agentsDir)).sort();
    expect(installedAgents).toEqual([...AGENT_FILENAMES].sort());

    const installedReferences = (await readdir(outcome.referencesDir)).sort();
    expect(installedReferences).toEqual(await sourceReferenceNames());

    const installedTemplates = (await readdir(outcome.templatesDir)).sort();
    expect(installedTemplates).toEqual(await sourceTemplateNames());

    const manifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    expect(manifest.version).toBe(await readPackageVersion());
    expect(manifest.agentFiles.sort()).toEqual([...AGENT_FILENAMES].sort());
    expect(manifest.referencesDir).toBe(outcome.referencesDir);
    expect(manifest.templatesDir).toBe(outcome.templatesDir);

    const hashedPaths = manifest.hashes.map((entry) => entry.path).sort();
    const expectedPaths = [
      ...AGENT_FILENAMES.map((name) => path.join("agents", name)),
      ...installedReferences.map((name) => path.join("opencode-architect", "references", name)),
      ...installedTemplates.map((name) => path.join("opencode-architect", "templates", name)),
    ].sort();
    expect(hashedPaths).toEqual(expectedPaths);

    for (const entry of manifest.hashes) {
      const installedPath = path.join(scopeBase("local"), entry.path);
      expect(await sha256(installedPath)).toBe(entry.hash);
    }
  });

  test("payload separates templates into their own directory", async () => {
    const outcome = await installer.install("local", { force: false, projectDir });

    for (const name of await readdir(outcome.agentsDir)) {
      expect(name.includes("template")).toBe(false);
    }
    for (const name of await readdir(outcome.referencesDir)) {
      expect(name.includes("template")).toBe(false);
    }
    expect((await readdir(outcome.templatesDir)).sort()).toEqual(await sourceTemplateNames());
  });

  test("global install respects XDG_CONFIG_HOME", async () => {
    const outcome = await installer.install("global", { force: false, projectDir });

    expect(outcome.scope).toBe("global");
    expect(outcome.agentsDir).toBe(path.join(scopeBase("global"), "agents"));
    expect(existsSync(path.join(scopeBase("global"), "opencode-architect.json"))).toBe(true);
    expect((await readdir(outcome.agentsDir)).sort()).toEqual([...AGENT_FILENAMES].sort());
  });

  test("rewrites relative references to absolute installed paths", async () => {
    const outcome = await installer.install("local", { force: false, projectDir });
    const agentPath = path.join(outcome.agentsDir, "opencode-architect.md");
    const content = await readFile(agentPath, "utf-8");

    const leftoverRelative = [...content.matchAll(RELATIVE_REFERENCE_REGEX)].map((m) => m[1] ?? "");
    expect(leftoverRelative).toEqual([]);

    const absolutePaths = [...content.matchAll(ABSOLUTE_PATH_REGEX)].map((m) => m[1] ?? "");
    const referencePaths = absolutePaths.filter((candidate) => /\.md$/.test(candidate));
    expect(referencePaths.length).toBeGreaterThanOrEqual(9);

    const normalizedReferencesDir = outcome.referencesDir.replaceAll("\\", "/");
    for (const referencePath of referencePaths) {
      expect(existsSync(referencePath), `missing rewritten path ${referencePath}`).toBe(true);
      expect(referencePath.startsWith(normalizedReferencesDir)).toBe(true);
    }
  });

  test("rewrites template references to absolute installed paths", async () => {
    const outcome = await installer.install("local", { force: false, projectDir });
    const agentPath = path.join(outcome.agentsDir, "opencode-packager.md");
    const content = await readFile(agentPath, "utf-8");

    const leftoverRelative = [...content.matchAll(RELATIVE_REFERENCE_REGEX)].map((m) => m[1] ?? "");
    expect(leftoverRelative).toEqual([]);

    const absolutePaths = [...content.matchAll(ABSOLUTE_PATH_REGEX)].map((m) => m[1] ?? "");
    const templatePaths = absolutePaths.filter((candidate) => /\.(txt|json|md)$/.test(candidate));
    expect(templatePaths.length).toBeGreaterThanOrEqual(5);

    const normalizedTemplatesDir = outcome.templatesDir.replaceAll("\\", "/");
    for (const templatePath of templatePaths) {
      expect(existsSync(templatePath), `missing rewritten path ${templatePath}`).toBe(true);
      expect(templatePath.startsWith(normalizedTemplatesDir)).toBe(true);
    }
  });

  test("same-version re-run is a no-op", async () => {
    await installer.install("local", { force: false, projectDir });

    const agentPath = path.join(scopeBase("local"), "agents", "opencode-architect.md");
    const tampered = await readFile(agentPath, "utf-8") + "\ntampered";
    await writeFile(agentPath, tampered);
    const manifestBefore = await readFile(manifestPath("local"), "utf-8");

    const outcome = await installer.install("local", { force: false, projectDir });

    expect(outcome.action).toBe("noop");
    expect(outcome.copied).toEqual([]);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.overwritten).toEqual([]);
    expect(await readFile(agentPath, "utf-8")).toBe(tampered);
    expect(await readFile(manifestPath("local"), "utf-8")).toBe(manifestBefore);
  });

  test("upgrade re-copies untouched files and skips locally modified ones", async () => {
    await installer.install("local", { force: false, projectDir });

    const fakeManifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    fakeManifest.version = "0.0.1";
    await writeFile(manifestPath("local"), JSON.stringify(fakeManifest, null, 2));

    const untouchedPath = path.join(scopeBase("local"), "agents", "opencode-architect.md");
    const untouchedInstalled = await readFile(untouchedPath, "utf-8");
    const doctored = untouchedInstalled + "\ndoctored but hash updated";
    await writeFile(untouchedPath, doctored);
    fakeManifest.hashes = fakeManifest.hashes.map((entry) =>
      entry.path === path.join("agents", "opencode-architect.md")
        ? { path: entry.path, hash: createHash("sha256").update(doctored).digest("hex") }
        : entry,
    );
    await writeFile(manifestPath("local"), JSON.stringify(fakeManifest, null, 2));

    const modifiedName = "opencode-skill-creator.md";
    const modifiedPath = path.join(scopeBase("local"), "agents", modifiedName);
    const modifiedSource = await readFile(path.join(SOURCE_AGENTS_DIR, modifiedName), "utf-8");
    await writeFile(modifiedPath, modifiedSource + "\nlocally modified");

    const outcome = await installer.install("local", { force: false, projectDir });

    expect(outcome.action).toBe("upgraded");
    expect(outcome.skipped).toEqual([path.join("agents", modifiedName)]);
    expect(outcome.copied).toContain(path.join("agents", "opencode-architect.md"));
    expect(await readFile(untouchedPath, "utf-8")).toBe(untouchedInstalled);
    expect(await readFile(modifiedPath, "utf-8")).toBe(modifiedSource + "\nlocally modified");
    expect((await readJson(manifestPath("local")) as unknown as Manifest).version).toBe(
      await readPackageVersion(),
    );

    const manifestAfterUpgrade = (await readJson(manifestPath("local"))) as unknown as Manifest;
    const modifiedEntry = manifestAfterUpgrade.hashes.find(
      (entry) => entry.path === path.join("agents", modifiedName),
    );
    const reinstalledSource = rewriteReferencePaths(modifiedSource, outcome.referencesDir, outcome.templatesDir);
    expect(modifiedEntry?.hash).toBe(sha256Text(reinstalledSource));

    manifestAfterUpgrade.version = "0.0.2";
    await writeFile(manifestPath("local"), JSON.stringify(manifestAfterUpgrade, null, 2));
    const secondUpgrade = await installer.install("local", { force: false, projectDir });
    expect(secondUpgrade.skipped).toEqual([path.join("agents", modifiedName)]);
    expect(await readFile(modifiedPath, "utf-8")).toBe(modifiedSource + "\nlocally modified");
  });

  test("upgrade with force overwrites locally modified files", async () => {
    await installer.install("local", { force: false, projectDir });

    const fakeManifest = (await readJson(manifestPath("local"))) as unknown as Manifest;
    fakeManifest.version = "0.0.1";
    await writeFile(manifestPath("local"), JSON.stringify(fakeManifest, null, 2));

    const modifiedName = "opencode-skill-creator.md";
    const modifiedPath = path.join(scopeBase("local"), "agents", modifiedName);
    const modifiedSource = await readFile(path.join(SOURCE_AGENTS_DIR, modifiedName), "utf-8");
    await writeFile(modifiedPath, modifiedSource + "\nlocally modified");

    const outcome = await installer.install("local", { force: true, projectDir });

    expect(outcome.action).toBe("upgraded");
    expect(outcome.overwritten).toContain(path.join("agents", modifiedName));
    expect(await readFile(modifiedPath, "utf-8")).toBe(
      rewriteReferencePaths(modifiedSource, outcome.referencesDir, outcome.templatesDir),
    );
  });

  test("refuses while the plugin entry exists", async () => {
    await writeJson(path.join(scopeBase("local"), "opencode.json"), {
      plugin: ["opencode-architect"],
    });

    expect(installer.install("local", { force: false, projectDir })).rejects.toThrow(/--force/);

    expect(existsSync(path.join(scopeBase("local"), "agents"))).toBe(false);
  });

  test("refuses and force-removes a versioned plugin entry", async () => {
    await writeJson(path.join(scopeBase("local"), "opencode.json"), {
      plugin: ["opencode-architect@^0.3.0"],
    });

    expect(installer.install("local", { force: false, projectDir })).rejects.toThrow(/--force/);
    expect(existsSync(path.join(scopeBase("local"), "agents"))).toBe(false);

    const outcome = await installer.install("local", { force: true, projectDir });

    expect(outcome.action).toBe("installed");
    expect(outcome.pluginRemoved).toBe(true);
    expect((await readJson(path.join(scopeBase("local"), "opencode.json"))).plugin).toBeUndefined();
    expect(existsSync(outcome.manifestPath)).toBe(true);
  });

  test("force removes the plugin entry and switches to copy mode", async () => {
    await writeJson(path.join(scopeBase("local"), "opencode.json"), {
      plugin: ["other-extension", "opencode-architect"],
    });

    const outcome = await installer.install("local", { force: true, projectDir });

    expect(outcome.action).toBe("installed");
    expect(outcome.pluginRemoved).toBe(true);
    expect(existsSync(outcome.manifestPath)).toBe(true);
    expect((await readdir(outcome.agentsDir)).sort()).toEqual([...AGENT_FILENAMES].sort());

    const config = await readJson(path.join(scopeBase("local"), "opencode.json"));
    expect(config.plugin).toEqual(["other-extension"]);
  });
});

describe("Installer.uninstall", () => {
  test("copy mode removes exactly the manifest files and keeps consumer files", async () => {
    await installer.install("local", { force: false, projectDir });

    const consumerAgentPath = path.join(scopeBase("local"), "agents", "consumer-own-agent.md");
    await writeFile(consumerAgentPath, "# consumer's own agent");
    const consumerRefPath = path.join(
      scopeBase("local"),
      "opencode-architect",
      "references",
      "consumer-note.md",
    );
    await writeFile(consumerRefPath, "consumer note");

    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.mode).toBe("copy");
    expect(outcome.removed).toContain(path.join(scopeBase("local"), "agents", "opencode-architect.md"));
    expect(outcome.removed).toContain(
      path.join(scopeBase("local"), "opencode-architect", "references", "agents.md"),
    );
    expect(outcome.removed).toContain(manifestPath("local"));
    expect(existsSync(manifestPath("local"))).toBe(false);
    expect(existsSync(path.join(scopeBase("local"), "agents", "opencode-architect.md"))).toBe(false);
    expect(existsSync(consumerAgentPath)).toBe(true);
    expect(existsSync(consumerRefPath)).toBe(true);
    expect(await readFile(consumerAgentPath, "utf-8")).toBe("# consumer's own agent");
  });

  test("copy uninstall removes emptied directories", async () => {
    await installer.install("local", { force: false, projectDir });

    await installer.uninstall("local", projectDir);

    expect(existsSync(path.join(scopeBase("local"), "agents"))).toBe(false);
    expect(existsSync(path.join(scopeBase("local"), "opencode-architect"))).toBe(false);
  });

  test("plugin mode removes only the plugin entry", async () => {
    await writeJson(path.join(scopeBase("local"), "opencode.json"), {
      plugin: ["opencode-architect", "other-extension"],
    });

    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.mode).toBe("plugin");
    expect(outcome.pluginRemoved).toBe(true);
    expect(outcome.removed).toEqual([]);

    const config = await readJson(path.join(scopeBase("local"), "opencode.json"));
    expect(config.plugin).toEqual(["other-extension"]);
  });

  test("uninstall with nothing installed is a no-op", async () => {
    const outcome = await installer.uninstall("local", projectDir);

    expect(outcome.mode).toBe("none");
    expect(outcome.removed).toEqual([]);
    expect(outcome.pluginRemoved).toBe(false);
  });
});

describe("Installer.status", () => {
  test("reports none for an empty scope", async () => {
    const outcome = await installer.status("local", projectDir);

    expect(outcome.mode).toBe("none");
    expect(outcome.version).toBeNull();
  });

  test("reports copy with the manifest version", async () => {
    await installer.install("local", { force: false, projectDir });

    const outcome = await installer.status("local", projectDir);

    expect(outcome.mode).toBe("copy");
    expect(outcome.version).toBe(await readPackageVersion());
  });

  test("reports plugin when only the entry exists", async () => {
    await writeJson(path.join(scopeBase("local"), "opencode.json"), {
      plugin: ["opencode-architect"],
    });

    const outcome = await installer.status("local", projectDir);

    expect(outcome.mode).toBe("plugin");
    expect(outcome.version).toBeNull();
  });

  test("prefers copy when the manifest and the plugin entry both exist", async () => {
    await installer.install("local", { force: false, projectDir });
    await writeJson(path.join(scopeBase("local"), "opencode.json"), {
      plugin: ["opencode-architect"],
    });

    const outcome = await installer.status("local", projectDir);

    expect(outcome.mode).toBe("copy");
    expect(outcome.version).toBe(await readPackageVersion());
  });
});
