import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CommandLoader, COMMAND_FILENAMES } from "../src/command-loader";
import { SkillLoader, UPGRADE_SKILL_ID } from "../src/skill-loader";
import { ConfigSchemaValidator } from "./config-schema-validator";
import { DocsFactGate } from "./docs-fact-gate";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "v1-extension-package");
const V2_FIXTURE = path.join(ROOT, "tests", "fixtures", "v2-extension-package");
const gate = new DocsFactGate(ROOT);

const SKILL_PATHS = [path.join(ROOT, "skills", UPGRADE_SKILL_ID, "SKILL.md")];
const COMMAND_PATHS = COMMAND_FILENAMES.map((name) => path.join(ROOT, "commands", name));

describe("bundled upgrade skill", () => {
  test("loads with a name, description, content, and a resolvable path", async () => {
    const skills = await new SkillLoader(path.join(ROOT, "skills")).loadSkills();

    expect(skills.map((skill) => skill.id)).toEqual([UPGRADE_SKILL_ID]);
    const skill = skills[0];
    if (!skill) throw new Error("upgrade skill did not load");
    expect(skill.name.length).toBeGreaterThan(0);
    expect(skill.description.length).toBeGreaterThan(0);
    expect(skill.content.trim().length).toBeGreaterThan(0);
    expect(skill.path.replaceAll("\\", "/")).toContain(`skills/${UPGRADE_SKILL_ID}/SKILL.md`);
  });

  test("documents every phase, the safety contract, and the v2 recommendations", async () => {
    const content = await readFile(SKILL_PATHS[0] as string, "utf-8");

    for (const phase of ["Inventory", "Classify", "Config rewrite", "Port plugin code", "Port v1 tool files", "Recommendations"]) {
      expect(content).toContain(phase);
    }
    for (const guarantee of [
      "Never touch the OpenCode application installation",
      "No-op on already-v2 projects",
      "Never clobber consumer-modified files",
      "manifest.json",
      "never rewrite it from an empty object",
    ]) {
      expect(content).toContain(guarantee);
    }
    for (const capability of ["session hooks", "RPC", "TUI plugins", "Code Mode", "Saved approvals"]) {
      expect(content).toContain(capability);
    }
  });
});

describe("bundled upgrade command", () => {
  test("loads with a description, a template, and an architect agent", async () => {
    const commands = await new CommandLoader(path.join(ROOT, "commands")).loadCommands();

    expect(commands.map((command) => command.name)).toEqual(["upgrade-opencode-v2"]);
    const command = commands[0];
    if (!command) throw new Error("upgrade command did not load");
    expect(command.description.length).toBeGreaterThan(0);
    expect(command.template).toContain("$ARGUMENTS");
    expect(command.template).toContain(UPGRADE_SKILL_ID);
  });
});

describe("bundled content traces to the verified-facts record (no v1 claims)", () => {
  test("the upgrade skill carries no known-false v1 claim", async () => {
    const violations: string[] = [];
    for (const skillPath of SKILL_PATHS) {
      const content = await readFile(skillPath, "utf-8");
      violations.push(...(await gate.findViolations(path.relative(ROOT, skillPath), content)));
    }
    expect(violations).toEqual([]);
  });

  test("the upgrade command carries no known-false v1 claim", async () => {
    const violations: string[] = [];
    for (const commandPath of COMMAND_PATHS) {
      const content = await readFile(commandPath, "utf-8");
      violations.push(...(await gate.findViolations(path.relative(ROOT, commandPath), content)));
    }
    expect(violations).toEqual([]);
  });
});

describe("the upgrade guidance covers the v1 fixture package", () => {
  test("every v1 config key in the fixture is documented in the mapping", async () => {
    const content = await readFile(SKILL_PATHS[0] as string, "utf-8");
    const config = JSON.parse(await readFile(path.join(FIXTURE, ".opencode", "opencode.json"), "utf-8")) as Record<string, unknown>;

    for (const key of Object.keys(config).filter((key) => !key.startsWith("$"))) {
      expect(content, `skill does not document the v1 config key ${key}`).toContain(key);
    }
  });

  test("the code-port guidance names the v1 plugin file and the v1 file-based tool file", async () => {
    const content = await readFile(SKILL_PATHS[0] as string, "utf-8");
    expect(content).toContain("v1 plugin file");
    expect(content).toContain(".opencode/tools");
    expect(content).toContain("tool.schema");
  });
});

describe("the golden v2 fixture is the upgraded output of the v1 fixture", () => {
  test("the rewritten config validates against the pinned v2 schema", async () => {
    const text = await readFile(path.join(V2_FIXTURE, ".opencode", "opencode.json"), "utf-8");
    const verdict = new ConfigSchemaValidator().validateText(text, false);
    expect(verdict.issue).toBeNull();
    expect(verdict.ok).toBe(true);
  });

  test("the upgraded config carries no v1 key", async () => {
    const text = await readFile(path.join(V2_FIXTURE, ".opencode", "opencode.json"), "utf-8");
    const config = JSON.parse(text) as Record<string, unknown>;

    for (const key of [
      "plugin",
      "permission",
      "agent",
      "command",
      "tools",
      "autoupdate",
      "small_model",
      "attachment",
      "snapshot",
      "reference",
    ]) {
      expect(config, `v1 key ${key} survived the upgrade`).not.toHaveProperty(key);
    }
    expect(config, "auto-discovered plugins keep registration out of the config").not.toHaveProperty("plugins");
    expect(config).toHaveProperty("permissions");
    expect(config).toHaveProperty("agents");
    expect(config).toHaveProperty("commands");
  });

  test("the ported plugin uses the Effect-first v2 API and no v1 authoring package", async () => {
    const plugin = await readFile(path.join(V2_FIXTURE, ".opencode", "plugins", "notify.ts"), "utf-8");
    expect(plugin).toContain("Plugin.define");
    expect(plugin).toContain("@opencode/plugin/effect");
    expect(plugin).not.toContain("@opencode-ai/plugin");
  });

  test("the ported agent drops top-level v1 frontmatter fields", async () => {
    const agent = await readFile(path.join(V2_FIXTURE, ".opencode", "agents", "pr-reviewer.md"), "utf-8");
    expect(agent).not.toMatch(/^(prompt|maxSteps|disable|temperature|top_p|tools|permission):/m);
    expect(agent).toMatch(/^request:/m);
    expect(agent).toMatch(/^steps:/m);
    expect(agent).toMatch(/^permissions:/m);
  });

  test("the ported skill drops the v1-only license and metadata fields", async () => {
    const skill = await readFile(path.join(V2_FIXTURE, ".opencode", "skills", "release-notes", "SKILL.md"), "utf-8");
    expect(skill).not.toMatch(/^(license|metadata|compatibility):/m);
  });

  test("the upgrade produced a recommendations report naming the v2 capabilities", async () => {
    const report = await readFile(path.join(V2_FIXTURE, "upgrade-report.md"), "utf-8");
    for (const capability of ["session hooks", "RPC", "TUI plugins", "Code Mode", "Saved approvals"]) {
      expect(report).toContain(capability);
    }
    expect(report).toContain("application installation was not touched");
    expect(report).toContain("clean no-op");
  });
});
