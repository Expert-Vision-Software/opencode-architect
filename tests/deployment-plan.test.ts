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

describe("generated-package cache hygiene (issue #14)", () => {
  test("installer template prunes self cache copies on install, warn-and-continue", async () => {
    const source = await readTemplate("installer.template.txt");
    expect(source).toContain("prunePackageCache");
    expect(source).toContain("const cache = await prunePackageCache();");
    expect(source).toContain("clearPackageCache");
    expect(source).toMatch(/Could not clear cached package/);
    expect(source).toContain('"opencode", "packages"');
  });

  test("installer prunes every invocation including no-ops, before mode dispatch", async () => {
    const source = await readTemplate("installer.template.txt");
    const installBody = source.slice(source.indexOf("export async function install("));
    const pruneIndex = installBody.indexOf("await prunePackageCache()");
    const copyBranch = installBody.indexOf('if (mode === "copy")');
    expect(pruneIndex).toBeGreaterThan(-1);
    expect(copyBranch).toBeGreaterThan(pruneIndex);
  });

  test("generated CLI exposes a self-only clear-cache without --package/--all", async () => {
    const source = await readTemplate("cli.template.txt");
    const code = source.slice(source.indexOf("#!/usr/bin/env bun"));
    expect(code).toContain('case "clear-cache"');
    expect(code).toContain("clearPackageCache");
    expect(code).toContain("nothing to remove");
    expect(code).not.toMatch(/package:\s*\{/);
    expect(code).not.toMatch(/all:\s*\{/);
  });

  test("load-time advisory names bunx <pkg> clear-cache and the hook never deletes", async () => {
    const source = await readTemplate("plugin-local.template.txt");
    expect(source).toContain("clear-cache");
    expect(source).toMatch(/bunx \$\{PACKAGE_NAME\} clear-cache/);
    expect(source).not.toMatch(/await rm\(|rmSync/);
  });

  test("conformance checklist covers cache hygiene and the auditor consumes every item", async () => {
    const checklist = await readReference("conformance-checklist.md");
    expect(checklist).toContain("**A6 Cache hygiene");
    expect(checklist).toContain("clear-cache");
    const auditor = await readAgent("opencode-extension-auditor.md");
    expect(auditor).toContain("every item in the checklist");
  });

  test("packager and publisher instructions require generated packages to carry cache hygiene", async () => {
    const packager = await readAgent("opencode-packager.md");
    const publisher = await readAgent("opencode-publisher.md");
    expect(packager).toContain("clear-cache");
    expect(packager).toContain("A6");
    expect(publisher).toContain("clear-cache");
    expect(publisher).toContain("A6");
  });
});

describe("package-root content layout (no assets/ wrapper)", () => {
  test("installer resolves content directories at the package root by default", async () => {
    const source = await readTemplate("installer.template.txt");
    expect(source).toContain('const ASSET_LAYOUT_DIR = ".";');
    expect(source).not.toContain('const ASSET_LAYOUT_DIR = "assets";');
  });

  test("package.json templates list content directories, never assets", async () => {
    for (const template of ["package-basics.template.json", "package-full.template.json"]) {
      const source = await readTemplate(template);
      const json = JSON.parse(source.slice(source.indexOf("{")));
      const files = json.files as string[];
      expect(files).toContain("skills");
      expect(files).toContain("commands");
      expect(files).not.toContain("assets");
      expect(json.content).toBe("assets");
    }
  });

  test("templates address skills and commands at the package root", async () => {
    for (const template of ["plugin-local.template.txt", "index.template.txt", "installer.template.txt"]) {
      const source = await readTemplate(template);
      expect(source).not.toContain("assets/skills");
      expect(source).not.toContain("assets/commands");
    }
  });

  test("packager establishes the repo root before any path resolution", async () => {
    const packager = await readAgent("opencode-packager.md");
    expect(packager).toContain("Establish the workspace root");
    expect(packager).toContain("git rev-parse --show-toplevel");
    expect(packager).toContain("never the `.opencode/` directory");
    expect(packager).toContain("never a sibling of `.opencode/`");
  });

  test("packager chooses the deployment target: this workspace by default, sibling on request or heavy merges", async () => {
    const packager = await readAgent("opencode-packager.md");
    expect(packager).toContain("Choose the deployment target");
    expect(packager).toContain("This workspace (default)");
    expect(packager).toContain("a mostly-empty repo never triggers sibling mode");
    expect(packager).toContain("Sibling");
    expect(packager).toContain("opencode-plugin-engineer");
    expect(packager).toContain("recommend sibling mode");
    expect(packager).toContain("no `assets/` intermediary");
    expect(packager).toContain("skills/<skill>/SKILL.md");
  });

  test("publisher verifies package-root content directories", async () => {
    const publisher = await readAgent("opencode-publisher.md");
    expect(publisher).toContain("package root");
    expect(publisher).not.toContain("assets/skills/");
  });

  test("architect routes packaging to this workspace by default", async () => {
    const architect = await readAgent("opencode-architect.md");
    expect(architect).toContain("this workspace root by default");
  });
});

async function readTemplate(name: string): Promise<string> {
  const source = await readFile(path.join(REPO_ROOT, "assets/templates", name), "utf-8");
  return source.split("---").slice(1).join("---");
}

async function readAgent(name: string): Promise<string> {
  return readFile(path.join(REPO_ROOT, "assets/agents", name), "utf-8");
}

async function readReference(name: string): Promise<string> {
  return readFile(path.join(REPO_ROOT, "assets/references", name), "utf-8");
}
