import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PluginConfigEditor } from "../plugin-config";

const ROOT = path.join(import.meta.dirname, "..", ".tmp-plugin-config-test");

async function makeDir(relative: string): Promise<string> {
  const dir = path.join(ROOT, relative);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function write(relative: string, content: string): Promise<string> {
  const filePath = path.join(ROOT, relative);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return filePath;
}

function editor(): PluginConfigEditor {
  return new PluginConfigEditor();
}

function parseJsonc(text: string): Record<string, unknown> {
  const chars = text.split("");
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < chars.length; i++) {
    const current = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : "";
    if (inLine) {
      if (current === "\n") inLine = false;
      else chars[i] = " ";
      continue;
    }
    if (inBlock) {
      if (current === "*" && next === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        inBlock = false;
      } else chars[i] = " ";
      continue;
    }
    if (inString) {
      if (current === "\\") i++;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      continue;
    }
    if (current === "/" && next === "/") {
      chars[i] = " ";
      chars[i + 1] = " ";
      i++;
      inLine = true;
      continue;
    }
    if (current === "/" && next === "*") {
      chars[i] = " ";
      chars[i + 1] = " ";
      i++;
      inBlock = true;
    }
  }
  return JSON.parse(chars.join("").replace(/,(\s*[}\]])/g, "$1"));
}

beforeEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(ROOT, { recursive: true });
});

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe("PluginConfigEditor.ensurePluginEntry", () => {
  test("splices the entry leaving every other byte untouched", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write(
      "project/opencode.jsonc",
      [
        "{",
        "  // consumer comment, keep me",
        '  "$schema": "https://opencode.ai/config.json",',
        '  "model": "x/y",',
        '  "plugin": [',
        '    "some-other-plugin",',
        "  ],",
        "}",
        "",
      ].join("\n"),
    );
    const before = await readFile(configPath, "utf-8");

    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("updated");
    expect(outcome.configPath).toBe(configPath);
    const after = await readFile(configPath, "utf-8");
    expect(after).toContain('"my-pkg"');
    const without = after.replace('"my-pkg",', "").replace(/,\s*,/g, ",");
    expect(without.split('"plugin"')[0]).toBe(before.split('"plugin"')[0]);
    const parsed = parseJsonc(after);
    expect(parsed.plugin).toContain("my-pkg");
    expect(parsed.plugin).toContain("some-other-plugin");
    expect(parsed.model).toBe("x/y");
  });

  test("performs no write when a semantically matching entry exists", async () => {
    const projectDir = await makeDir("project");
    for (const entry of ["my-pkg", "my-pkg@1.2.3", "my-pkg@latest"]) {
      const configPath = await write(
        "project/opencode.json",
        `{ "plugin": ["other", "${entry}"] }\n`,
      );
      const before = await readFile(configPath, "utf-8");
      const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
      expect(outcome.action).toBe("noop");
      expect(await readFile(configPath, "utf-8")).toBe(before);
      await rm(configPath);
    }
  });

  test("creates a repo-root opencode.jsonc when no config exists anywhere", async () => {
    const projectDir = await makeDir("project");
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("created");
    expect(outcome.configPath).toBe(path.join(projectDir, "opencode.jsonc"));
    const parsed = parseJsonc(await readFile(path.join(projectDir, "opencode.jsonc"), "utf-8"));
    expect(parsed.plugin).toEqual(["my-pkg"]);
    expect(parsed.$schema).toContain("config.json");
  });

  test("warns and aborts without modification when a candidate config is unparseable", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write("project/opencode.json", "{ not valid json !!!\n");
    const before = await readFile(configPath, "utf-8");

    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("blocked");
    expect(outcome.warning).toContain("could not be parsed");
    expect(await readFile(configPath, "utf-8")).toBe(before);
  });

  test("strict .json rejects comments and trailing commas", async () => {
    const projectDir = await makeDir("project");
    await write("project/opencode.json", '{ "plugin": ["a",], }\n');
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("blocked");
  });

  test("lenient .jsonc accepts comments and trailing commas", async () => {
    const projectDir = await makeDir("project");
    await write(
      "project/opencode.jsonc",
      '{ /* c */ "plugin": ["a",], // trailing\n}\n',
    );
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
  });

  test("schema URLs with // and escaped quotes survive splicing and parsing", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write(
      "project/opencode.jsonc",
      '{ "$schema": "https://opencode.ai/config.json", "key": "a \\"quoted\\" // value", "plugin": [] }\n',
    );
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
    const parsed = JSON.parse((await readFile(configPath, "utf-8")).replace(/,(\s*[}\]])/g, "$1"));
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.key).toBe('a "quoted" // value');
    expect(parsed.plugin).toEqual(["my-pkg"]);
  });

  test("scope base config wins over repo root; existing scope-base file is edited", async () => {
    const projectDir = await makeDir("project");
    const scopeBasePath = await write(
      "project/.opencode/opencode.json",
      '{ "plugin": [] }\n',
    );
    await write("project/opencode.json", '{ "plugin": [] }\n');
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
    expect(outcome.configPath).toBe(scopeBasePath);
  });

  test("global scope creates scope-base opencode.jsonc when nothing exists", async () => {
    const projectDir = await makeDir("project");
    const xdg = await makeDir("xdg");
    process.env.XDG_CONFIG_HOME = xdg;
    try {
      const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "global", projectDir });
      expect(outcome.action).toBe("created");
      expect(outcome.configPath).toBe(path.join(xdg, "opencode", "opencode.jsonc"));
    } finally {
      delete process.env.XDG_CONFIG_HOME;
    }
  });

  test("global config.json with the entry is a read-only no-op", async () => {
    const projectDir = await makeDir("project");
    const xdg = await makeDir("xdg");
    const globalConfig = await write(
      "xdg/opencode/config.json",
      '{ "plugin": ["my-pkg@2.0.0"] }\n',
    );
    process.env.XDG_CONFIG_HOME = xdg;
    try {
      const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "global", projectDir });
      expect(outcome.action).toBe("noop");
      expect(outcome.configPath).toBe(globalConfig);
      expect(await readFile(globalConfig, "utf-8")).toBe('{ "plugin": ["my-pkg@2.0.0"] }\n');
    } finally {
      delete process.env.XDG_CONFIG_HOME;
    }
  });

  test("does not write into read-only global config.json when entry is absent", async () => {
    const projectDir = await makeDir("project");
    const xdg = await makeDir("xdg");
    const globalConfig = await write("xdg/opencode/config.json", '{ "model": "x/y" }\n');
    process.env.XDG_CONFIG_HOME = xdg;
    try {
      const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "global", projectDir });
      expect(outcome.action).toBe("created");
      expect(await readFile(globalConfig, "utf-8")).toBe('{ "model": "x/y" }\n');
      const created = parseJsonc(await readFile(path.join(xdg, "opencode", "opencode.jsonc"), "utf-8"));
      expect(created.plugin).toEqual(["my-pkg"]);
    } finally {
      delete process.env.XDG_CONFIG_HOME;
    }
  });

  test("splices an inline empty plugin array in a minified config", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write("project/opencode.json", '{"plugin":[]}\n');
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
    expect(await readFile(configPath, "utf-8")).toBe('{"plugin":["my-pkg"]}\n');
  });

  test("config without a plugin key gets one spliced in, rest untouched", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write(
      "project/opencode.jsonc",
      '{\n  "model": "x/y",\n}\n',
    );
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
    const after = await readFile(configPath, "utf-8");
    expect(after).toContain('"plugin": ["my-pkg"],');
    expect(after).toContain('"model": "x/y"');
    const parsed = JSON.parse(after.replace(/,(\s*[}\]])/g, "$1"));
    expect(parsed.plugin).toEqual(["my-pkg"]);
  });
});
