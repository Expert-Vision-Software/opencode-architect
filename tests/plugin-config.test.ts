import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PluginConfigEditor } from "../src/plugin-config";
import { captureConsole } from "./test-helpers";

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
        '  "plugins": [',
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
    expect(after).toContain('"my-pkg@latest"');
    const without = after.replace('"my-pkg@latest",', "").replace(/,\s*,/g, ",");
    expect(without.split('"plugins"')[0]).toBe(before.split('"plugins"')[0]);
    const parsed = parseJsonc(after);
    expect(parsed.plugins).toContain("my-pkg@latest");
    expect(parsed.plugins).toContain("some-other-plugin");
    expect(parsed.model).toBe("x/y");
  });

  test("writes a new entry in the canonical name@latest form", async () => {
    const projectDir = await makeDir("project");
    await write("project/opencode.json", '{ "plugins": ["other"] }\n');

    await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

    const parsed = parseJsonc(await readFile(path.join(projectDir, "opencode.json"), "utf-8"));
    expect(parsed.plugins).toContain("my-pkg@latest");
    expect(parsed.plugins).not.toContain("my-pkg");
  });

  test("performs no write when a semantically matching entry exists", async () => {
    const projectDir = await makeDir("project");
    for (const entry of ["my-pkg", "my-pkg@1.2.3", "my-pkg@latest"]) {
      const configPath = await write(
        "project/opencode.json",
        `{ "plugins": ["other", "${entry}"] }\n`,
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
    expect(parsed.plugins).toEqual(["my-pkg@latest"]);
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

  test("warns about an unparseable candidate even when an earlier candidate matches", async () => {
    const projectDir = await makeDir("project");
    await write("project/.opencode/opencode.json", '{ "plugins": ["my-pkg"] }\n');
    const brokenRoot = await write("project/opencode.json", "{ broken ]");
    const captured = captureConsole("warn");

    try {
      const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

      expect(outcome.action).toBe("noop");
      expect(captured.lines.some((message) => message.includes(brokenRoot))).toBe(true);
    } finally {
      captured.restore();
    }
  });

  test("findRegistration warns about unparseable candidates and still finds later registrations", async () => {
    const projectDir = await makeDir("project");
    await write("project/.opencode/opencode.json", "{ broken ]");
    const rootConfig = await write("project/opencode.json", '{ "plugins": ["my-pkg@1.0.0"] }\n');
    const captured = captureConsole("warn");

    try {
      const found = await editor().findRegistration("my-pkg", { scope: "local", projectDir });

      expect(found).toBe(rootConfig);
      expect(captured.lines.some((message) => message.includes(".opencode"))).toBe(true);
    } finally {
      captured.restore();
    }
  });

  test("unparseable read-only candidate is warned about and skipped, never blocking removal", async () => {
    const projectDir = await makeDir("project");
    const xdg = await makeDir("xdg");
    const readOnlyConfig = await write("xdg/opencode/config.json", "{ broken ]");
    process.env.XDG_CONFIG_HOME = xdg;
    const captured = captureConsole("warn");

    try {
      const outcome = await editor().removePluginEntry("my-pkg", { scope: "global", projectDir });

      expect(outcome.action).toBe("noop");
      expect(captured.lines.some((message) => message.includes(readOnlyConfig))).toBe(true);
      expect(await readFile(readOnlyConfig, "utf-8")).toBe("{ broken ]");
    } finally {
      captured.restore();
      delete process.env.XDG_CONFIG_HOME;
    }
  });

  test("strict .json rejects comments and trailing commas", async () => {
    const projectDir = await makeDir("project");
    await write("project/opencode.json", '{ "plugins": ["a",], }\n');
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("blocked");
  });

  test("lenient .jsonc accepts comments and trailing commas", async () => {
    const projectDir = await makeDir("project");
    await write(
      "project/opencode.jsonc",
      '{ /* c */ "plugins": ["a",], // trailing\n}\n',
    );
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
  });

  test("lenient .jsonc tolerates a comment between a trailing comma and its closer", async () => {
    const projectDir = await makeDir("project");
    await write("project/opencode.jsonc", '{ "plugins": ["other",/* c */], }\n');

    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("updated");
    const parsed = parseJsonc(await readFile(path.join(projectDir, "opencode.jsonc"), "utf-8"));
    expect(parsed.plugins).toContain("my-pkg@latest");
    expect(parsed.plugins).toContain("other");
  });

  test("schema URLs with // and escaped quotes survive splicing and parsing", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write(
      "project/opencode.jsonc",
      '{ "$schema": "https://opencode.ai/config.json", "key": "a \\"quoted\\" // value", "plugins": [] }\n',
    );
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
    const parsed = JSON.parse((await readFile(configPath, "utf-8")).replace(/,(\s*[}\]])/g, "$1"));
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.key).toBe('a "quoted" // value');
    expect(parsed.plugins).toEqual(["my-pkg@latest"]);
  });

  test("scope base config wins over repo root; existing scope-base file is edited", async () => {
    const projectDir = await makeDir("project");
    const scopeBasePath = await write(
      "project/.opencode/opencode.json",
      '{ "plugins": [] }\n',
    );
    await write("project/opencode.json", '{ "plugins": [] }\n');
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

  test("global config.json with the entry is a read-only no-op with an upgrade advisory", async () => {
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
      expect(outcome.warning).toContain("legacy v1");
      expect(outcome.warning).toContain("no longer reads config.json");
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
      expect(created.plugins).toEqual(["my-pkg@latest"]);
    } finally {
      delete process.env.XDG_CONFIG_HOME;
    }
  });

  test("splices an inline empty plugin array in a minified config", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write("project/opencode.json", '{"plugins":[]}\n');
    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });
    expect(outcome.action).toBe("updated");
    expect(await readFile(configPath, "utf-8")).toBe('{"plugins":["my-pkg@latest"]}\n');
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
    expect(after).toContain('"plugins": ["my-pkg@latest"],');
    expect(after).toContain('"model": "x/y"');
    const parsed = JSON.parse(after.replace(/,(\s*[}\]])/g, "$1"));
    expect(parsed.plugins).toEqual(["my-pkg@latest"]);
  });

  test("a legacy v1 plugin entry is a zero-write no-op with an upgrade advisory", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write(
      "project/opencode.json",
      '{ "plugin": ["other", "my-pkg@1.0.0"] }\n',
    );
    const before = await readFile(configPath, "utf-8");

    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("noop");
    expect(outcome.configPath).toBe(configPath);
    expect(outcome.warning).toContain("legacy v1");
    expect(outcome.warning).toContain(configPath);
    expect(outcome.warning).toContain('"plugins"');
    expect(await readFile(configPath, "utf-8")).toBe(before);
  });

  test("writes the v2 plugins key alongside a legacy plugin key holding other packages", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write("project/opencode.json", '{ "plugin": ["old-one"] }\n');

    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("updated");
    const parsed = parseJsonc(await readFile(configPath, "utf-8"));
    expect(parsed.plugins).toEqual(["my-pkg@latest"]);
    expect(parsed.plugin).toEqual(["old-one"]);
  });

  test("an object-form v2 entry matches semantically without a write", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write(
      "project/opencode.json",
      '{ "plugins": [{ "package": "my-pkg", "options": { "x": 1 } }] }\n',
    );
    const before = await readFile(configPath, "utf-8");

    const outcome = await editor().ensurePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("noop");
    expect(await readFile(configPath, "utf-8")).toBe(before);
  });

  test("findRegistration finds a legacy v1 plugin registration", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write("project/opencode.json", '{ "plugin": ["my-pkg"] }\n');

    const found = await editor().findRegistration("my-pkg", { scope: "local", projectDir });

    expect(found).toBe(configPath);
  });
});

describe("PluginConfigEditor.removePluginEntry", () => {
  test("leaves a legacy-only entry untouched and advises instead of removing", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write("project/opencode.json", '{ "plugin": ["my-pkg"] }\n');
    const before = await readFile(configPath, "utf-8");

    const outcome = await editor().removePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("noop");
    expect(outcome.configPath).toBe(configPath);
    expect(outcome.warning).toContain("legacy v1");
    expect(outcome.warning).toContain(configPath);
    expect(await readFile(configPath, "utf-8")).toBe(before);
  });

  test("removes an object-form v2 entry and keeps the rest of the array", async () => {
    const projectDir = await makeDir("project");
    const configPath = await write(
      "project/opencode.json",
      '{ "plugins": [{ "package": "my-pkg", "options": {} }, "other"] }\n',
    );

    const outcome = await editor().removePluginEntry("my-pkg", { scope: "local", projectDir });

    expect(outcome.action).toBe("removed");
    expect(outcome.configPath).toBe(configPath);
    const parsed = JSON.parse(await readFile(configPath, "utf-8"));
    expect(parsed.plugins).toEqual(["other"]);
  });
});
