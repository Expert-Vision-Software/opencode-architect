import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

describe("content-based deployment plan (issue #18)", () => {
  test("installer reads the content declaration", async () => {
    const source = await readTemplate("installer.template.txt");
    expect(source).toContain("getContentDeclaration");
    expect(source).toMatch(/InstallMode/);
  });

  test("assets-only default is copy and plugin mode is opt-in", async () => {
    const source = await readTemplate("installer.template.txt");
    expect(source).toMatch(/requested \?\? "copy"/);
    expect(source).toContain('"plugin"');
  });

  test("code-backed copy mode is a hard error", async () => {
    const source = await readTemplate("installer.template.txt");
    expect(source).toMatch(/CopyModeUnsupportedError/);
  });

  test("copy install writes no config files", async () => {
    const source = await readTemplate("installer.template.txt");
    expect(source).not.toContain("ensureSkillPermission");
    expect(source).not.toContain("addMcpServer");
    expect(source).not.toContain("configurePermission");
  });

  test("installer delegates plugin-array edits to the surgical editor", async () => {
    const source = await readTemplate("installer.template.txt");
    expect(source).toContain("PluginConfigEditor");
    expect(source).not.toContain("addPluginToConfig");
    expect(source).not.toContain("removePluginFromConfig");
  });

  test("surgical editor template exists and never rewrites whole configs", async () => {
    const source = await readTemplate("plugin-config.template.txt");
    expect(source).toContain("class PluginConfigEditor");
    expect(source).toContain("spliceEntry");
    expect(source).not.toMatch(/JSON\.stringify\(config/);
  });

  test("manifest records mode, entry, and target config file", async () => {
    const source = await readTemplate("manifest.template.txt");
    expect(source).toMatch(/mode: InstallMode/);
    expect(source).toContain("entry: string | null");
    expect(source).toContain("entryConfigPath: string | null");
  });

  test("registration detection covers both bases, repo root, both extensions, and global config.json", async () => {
    const source = await readTemplate("registration.template.txt");
    expect(source).toContain("opencode.json");
    expect(source).toContain("opencode.jsonc");
    expect(source).toContain('"config.json"');
  });

  test("hook never edits the plugin array and ensures assets in registered scopes only", async () => {
    const source = await readTemplate("plugin-local.template.txt");
    expect(source).toContain("ensureAssets");
    expect(source).not.toMatch(/addPluginConfig:\s*true|ensurePluginEntry/);
  });

  test("hook body degrades to a warning plus advisory", async () => {
    const source = await readTemplate("plugin-local.template.txt");
    expect(source).toContain("adviseFailureOnce");
    expect(source).toContain("adviseNotInstalledOnce");
  });

  test("CLI exposes --mode and reflects mode and registration in status", async () => {
    const source = await readTemplate("cli.template.txt");
    expect(source).toContain("--mode");
    expect(source).toContain("entryConfigPath");
    expect(source).toContain("CopyModeUnsupportedError");
  });

  test("packager and publisher instructions reference the generalized flow", async () => {
    const packager = await readAgent("opencode-packager.md");
    const publisher = await readAgent("opencode-publisher.md");
    expect(packager).toContain("plugin-config.template.txt");
    expect(packager).toContain("content-based");
    expect(publisher).toContain("plugin-config.template.txt");
    expect(publisher).toContain("--mode");
  });
});

async function readTemplate(name: string): Promise<string> {
  const source = await readFile(path.join(REPO_ROOT, "assets/templates", name), "utf-8");
  return source.split("---").slice(1).join("---");
}

async function readAgent(name: string): Promise<string> {
  return readFile(path.join(REPO_ROOT, "assets/agents", name), "utf-8");
}
