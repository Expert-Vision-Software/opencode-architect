import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PluginConfigEditor } from "../src/core/plugin-config";
import { ConfigSchemaValidator } from "./config-schema-validator";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

const RICH_V2_CONFIG = `{
  "$schema": "https://opencode.ai/config.json",
  "model": { "providerID": "anthropic", "model": "claude-sonnet-4" },
  "permissions": [
    { "action": "shell", "resource": "bun test*", "effect": "allow" },
    { "action": "external_directory", "resource": "**", "effect": "ask" }
  ],
  "agents": {
    "helper": { "mode": "subagent", "description": "A helper", "color": "#22c55e" }
  },
  "commands": {
    "review": { "template": "Review the current changes.", "description": "Review" }
  },
  "mcp": {
    "docs": { "type": "remote", "url": "https://mcp.example.com/sse" }
  },
  "skills": ["./skills"],
  "instructions": ["AGENTS.md"],
  "plugins": [
    "other-plugin@latest",
    { "package": "configured-plugin", "options": { "region": "eu" } }
  ]
}
`;

const LEGACY_AND_V2_CONFIG = `{
  "plugin": ["other-legacy@1"],
  "plugins": ["kept-entry"]
}
`;

async function makeProject(configFileName: string | null, contents: string | null): Promise<string> {
  const projectDir = await mkdtemp(path.join(tmpdir(), "opencode-architect-config-schema-"));
  if (configFileName !== null && contents !== null) {
    await writeFile(path.join(projectDir, configFileName), contents);
  }
  return projectDir;
}

function readmeQuickStartConfig(): string {
  const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf-8");
  const match = readme.match(/```json\n([\s\S]*?)```/);
  if (!match) throw new Error("README carries no json snippet to validate");
  return match[1] as string;
}

describe("produced fixture configs against the v2 config schema", () => {
  const validator = new ConfigSchemaValidator();
  const editor = new PluginConfigEditor();

  test("the config created by the installer for a clean scope validates", async () => {
    const projectDir = await makeProject(null, null);
    try {
      const outcome = await editor.ensurePluginEntry("opencode-architect", { scope: "local", projectDir });
      expect(outcome.action).toBe("created");
      const text = await readFile(outcome.configPath ?? "", "utf-8");
      const verdict = validator.validateText(text, true);
      expect(verdict.issue).toBeNull();
      expect(verdict.ok).toBe(true);
      expect(verdict.config?.plugins).toEqual(["opencode-architect@latest"]);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test("a splice into a rich v2 config keeps the whole file schema-valid", async () => {
    const projectDir = await makeProject("opencode.json", RICH_V2_CONFIG);
    try {
      const outcome = await editor.ensurePluginEntry("opencode-architect", { scope: "local", projectDir });
      expect(outcome.action).toBe("updated");
      const text = await readFile(outcome.configPath ?? "", "utf-8");
      const verdict = validator.validateText(text, false);
      expect(verdict.issue).toBeNull();
      expect(verdict.ok).toBe(true);
      expect(verdict.config?.plugins).toHaveLength(3);
      expect(Object.keys(verdict.config?.agents ?? {})).toContain("helper");
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test("a legacy-only registration is a tolerated no-op and the untouched file validates", async () => {
    const projectDir = await makeProject("opencode.json", "{\n  \"plugin\": [\"opencode-architect@latest\"]\n}\n");
    try {
      const outcome = await editor.ensurePluginEntry("opencode-architect", { scope: "local", projectDir });
      expect(outcome.action).toBe("noop");
      expect(outcome.warning).toContain("legacy v1");
      const text = await readFile(outcome.configPath ?? "", "utf-8");
      const verdict = validator.validateText(text, false);
      expect(verdict.ok).toBe(true);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test("a config holding both the legacy v1 key and a live v2 array validates after the splice", async () => {
    const projectDir = await makeProject("opencode.json", LEGACY_AND_V2_CONFIG);
    try {
      const outcome = await editor.ensurePluginEntry("opencode-architect", { scope: "local", projectDir });
      expect(outcome.action).toBe("updated");
      const text = await readFile(outcome.configPath ?? "", "utf-8");
      const verdict = validator.validateText(text, false);
      expect(verdict.ok).toBe(true);
      expect(verdict.config?.plugins).toEqual(["opencode-architect@latest", "kept-entry"]);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test("the quick-start config taught in the README validates", () => {
    const verdict = validator.validateText(readmeQuickStartConfig(), false);
    expect(verdict.issue).toBeNull();
    expect(verdict.ok).toBe(true);
    expect(verdict.config?.plugins).toEqual(["opencode-architect@latest"]);
  });

  test("the pinned schema rejects v1 permission maps and invalid rule effects", () => {
    expect(validator.validateValue({ permissions: { bash: "allow" } }).ok).toBe(false);
    expect(
      validator.validateValue({ permissions: [{ action: "shell", resource: "*", effect: "sometimes" }] }).ok,
    ).toBe(false);
    expect(validator.validateValue({ plugins: [{ package: 42 }] }).ok).toBe(false);
  });

  test("unparseable fixtures are reported as issues, never thrown", async () => {
    const projectDir = await makeProject("opencode.jsonc", "{ not json ]");
    try {
      const text = await readFile(path.join(projectDir, "opencode.jsonc"), "utf-8");
      const verdict = validator.validateText(text, true);
      expect(verdict.ok).toBe(false);
      expect(verdict.issue).toContain("not parseable");
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test("schema validation accepts every config variant the editor can produce from a v2 baseline", async () => {
    const variants: Array<[string, string]> = [
      ["opencode.json", RICH_V2_CONFIG],
      ["opencode.jsonc", `{\n  // comment\n  "plugins": ["a@1"],\n}`],
    ];
    for (const [fileName, contents] of variants) {
      const projectDir = await makeProject(null, null);
      try {
        await mkdir(projectDir, { recursive: true });
        await writeFile(path.join(projectDir, fileName), contents);
        const outcome = await editor.ensurePluginEntry("opencode-architect", { scope: "local", projectDir });
        expect(outcome.action).toBe("updated");
        const text = await readFile(outcome.configPath ?? "", "utf-8");
        const verdict = validator.validateText(text, fileName.endsWith(".jsonc"));
        expect(verdict.ok).toBe(true);
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    }
  });
});
