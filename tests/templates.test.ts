import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DocsFactGate } from "./docs-fact-gate";
import { ConfigSchemaValidator } from "./config-schema-validator";
import { V2HostHarness } from "./v2-host-harness";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");
const RENDER_ROOT = path.join(REPO_ROOT, ".rendered-fixture");
const RENDERED_PACKAGE = path.join(RENDER_ROOT, "opencode-myextension");
const PACKAGE_NAME = "opencode-myextension";

const TEMPLATE_FILES = [
  "cli.template.txt",
  "index.template.txt",
  "installer.template.txt",
  "manifest.template.txt",
  "package-basics.template.json",
  "package-full.template.json",
  "plugin-config.template.txt",
  "plugin-local.template.txt",
  "plugin-name.template.txt",
  "prompts.template.txt",
  "registration.template.txt",
  "skill-structure.template.md",
  "tsconfig.template.json",
] as const;

const gate = new DocsFactGate(REPO_ROOT);
const validator = new ConfigSchemaValidator();
const harness = new V2HostHarness();

function templateBody(name: string): Promise<string> {
  return readFile(path.join(TEMPLATES_DIR, name), "utf-8").then((source) => {
    const separator = source.match(/^---$/m);
    if (separator === null || separator.index === undefined) return source;
    return source.slice(separator.index + 4).trimStart();
  });
}

async function renderPackage(): Promise<void> {
  const write = async (relative: string, content: string): Promise<void> => {
    const target = path.join(RENDERED_PACKAGE, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  await rm(RENDER_ROOT, { recursive: true, force: true });
  await write("index.ts", await templateBody("index.template.txt"));
  await write("src/plugin.ts", await templateBody("plugin-local.template.txt"));
  await write("src/plugin-name.ts", await templateBody("plugin-name.template.txt"));
  await write("src/manifest.ts", await templateBody("manifest.template.txt"));
  await write("src/registration.ts", await templateBody("registration.template.txt"));
  await write("src/plugin-config.ts", await templateBody("plugin-config.template.txt"));
  await write("src/installer.ts", await templateBody("installer.template.txt"));
  await write("src/cli.ts", await templateBody("cli.template.txt"));
  await write("package.json", await templateBody("package-basics.template.json"));
  await write("tsconfig.json", await templateBody("tsconfig.template.json"));
  await write("skills/myextension/SKILL.md", await templateBody("skill-structure.template.md"));
  await write(
    "commands/my-command.md",
    `---\ndescription: "Rendered command stub"\n---\n\nSay hello from ${PACKAGE_NAME}.\n`,
  );
}

interface SpawnOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runBun(args: string[], cwd: string, env: Record<string, string>): Promise<SpawnOutcome> {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]).then(
    ([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }),
  );
}

function isolatedEnv(base: string): Record<string, string> {
  return {
    ...process.env,
    XDG_CACHE_HOME: path.join(base, "cache"),
    XDG_CONFIG_HOME: path.join(base, "config"),
    HOME: path.join(base, "home"),
    USERPROFILE: path.join(base, "home"),
  } as Record<string, string>;
}

function failWithOutput(stage: string, outcome: SpawnOutcome): never {
  throw new Error(
    `${stage} failed (exit ${outcome.exitCode})\nstdout:\n${outcome.stdout}\nstderr:\n${outcome.stderr}`,
  );
}

describe("templates carry no known-false v1 claim", () => {
  for (const name of TEMPLATE_FILES) {
    test(`templates/${name}`, async () => {
      const content = await readFile(path.join(TEMPLATES_DIR, name), "utf-8");
      const violations = await gate.findViolations(`templates/${name}`, content);
      expect(violations).toEqual([]);
    });
  }
});

describe("package templates are v2-native", () => {
  for (const name of ["package-basics.template.json", "package-full.template.json"]) {
    test(`templates/${name}`, async () => {
      const body = await templateBody(name);
      const manifest = JSON.parse(body) as {
        content: string;
        exports: Record<string, string>;
        scripts: Record<string, string>;
        dependencies: Record<string, string>;
      };
      expect(manifest.content).toBe("assets");
      expect(manifest.exports["./server"], `${name} must declare exports["./server"] (facts §14.6)`).toBe(
        "./index.ts",
      );
      expect(manifest.dependencies["@opencode/plugin"], "consumer range must be latest (facts §15)").toBe("latest");
      expect(manifest.dependencies["effect"], "consumer range must be latest (facts §15)").toBe("latest");
      expect(manifest.dependencies["@opencode-ai/plugin"]).toBeUndefined();
      expect(manifest.scripts["check"]).toContain("tsc");
      expect(manifest.scripts["test"]).toBe("bun test");
    });
  }
});

describe("the plugin entry template is Effect-first v2", () => {
  test("plugin-local defines the plugin through the v2 Effect API", async () => {
    const body = await templateBody("plugin-local.template.txt");
    expect(body).toContain('"@opencode/plugin/effect"');
    expect(body).toContain("Plugin.define({");
    expect(body).toContain("Effect.fn(function* (context)");
    expect(body).toContain("context.location.directory");
    expect(body).toContain("id: PACKAGE_NAME");
    expect(body).not.toContain('"@opencode-ai/plugin"');
  });
});

describe("rendered package passes its own gates", () => {
  const projectDir = path.join(RENDER_ROOT, "consumer-project");
  let isolatedBase = "";

  beforeAll(async () => {
    await renderPackage();
    isolatedBase = await mkdtemp(path.join(tmpdir(), "opencode-architect-render-env-"));
    await mkdir(path.join(isolatedBase, "cache"), { recursive: true });
    await mkdir(path.join(isolatedBase, "config"), { recursive: true });
    await mkdir(path.join(isolatedBase, "home"), { recursive: true });
    await mkdir(projectDir, { recursive: true });
  }, 30_000);

  afterAll(async () => {
    await rm(RENDER_ROOT, { recursive: true, force: true });
    await rm(isolatedBase, { recursive: true, force: true });
  });

  test("typecheck (tsc --noEmit with the rendered tsconfig)", async () => {
    const tsc = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
    const outcome = await runBun(
      [tsc, "--noEmit", "-p", path.join(RENDERED_PACKAGE, "tsconfig.json")],
      RENDERED_PACKAGE,
      isolatedEnv(isolatedBase),
    );
    if (outcome.exitCode !== 0) failWithOutput("rendered package typecheck", outcome);
    expect(outcome.exitCode).toBe(0);
  }, 180_000);

  test("the rendered entry satisfies the v2 Module contract", async () => {
    const entrypoint = path.join(RENDERED_PACKAGE, "index.ts");
    const loaded = await import(pathToFileURL(entrypoint).href);
    const check = harness.moduleContract(loaded, entrypoint);
    expect(check.violation).toBeNull();
    expect(check.effectKind).toBe("effect");
    expect(check.id).toBe(PACKAGE_NAME);
  });

  test("install --mode plugin registers the package in the v2 plugins key", async () => {
    const outcome = await runBun(
      [path.join(RENDERED_PACKAGE, "src", "cli.ts"), "install", "--scope", "local", "--mode", "plugin"],
      projectDir,
      isolatedEnv(isolatedBase),
    );
    if (outcome.exitCode !== 0) failWithOutput("rendered package install", outcome);
    expect(outcome.stdout).toContain("mode: plugin");

    const configPath = path.join(projectDir, "opencode.jsonc");
    const configText = await readFile(configPath, "utf-8");
    const verdict = validator.validateText(configText, true);
    expect(verdict.ok, `created config must decode against the v2 schema: ${verdict.issue}`).toBe(true);
    expect(verdict.config?.plugins).toEqual([`${PACKAGE_NAME}@latest`]);

    const manifest = JSON.parse(
      await readFile(path.join(projectDir, ".opencode", `${PACKAGE_NAME}.manifest.json`), "utf-8"),
    ) as { mode: string; entry: string; entryConfigPath: string };
    expect(manifest.mode).toBe("plugin");
    expect(manifest.entry).toBe(`${PACKAGE_NAME}@latest`);
    expect(manifest.entryConfigPath.replaceAll("\\", "/")).toContain("opencode.jsonc");
  }, 60_000);

  test("status reports the plugin registration per scope", async () => {
    const outcome = await runBun(
      [path.join(RENDERED_PACKAGE, "src", "cli.ts"), "status"],
      projectDir,
      isolatedEnv(isolatedBase),
    );
    if (outcome.exitCode !== 0) failWithOutput("rendered package status", outcome);
    expect(outcome.stdout).toMatch(/Local: installed=true/);
    expect(outcome.stdout).toMatch(/pluginInConfig=true/);
  }, 60_000);

  test("activating the rendered plugin under the host contract ensures the payload", async () => {
    const entrypoint = path.join(RENDERED_PACKAGE, "index.ts");
    const loaded = (await import(pathToFileURL(entrypoint).href)) as { default: unknown };
    const definition = loaded.default as Parameters<typeof harness.activate>[0];
    const recording = harness.recordingContext(projectDir);

    await harness.activate(definition, recording);

    const skill = await readFile(
      path.join(projectDir, ".opencode", "skills", "myextension", "SKILL.md"),
      "utf-8",
    );
    expect(skill).toContain('name: "myextension"');
    const command = await readFile(path.join(projectDir, ".opencode", "commands", "my-command.md"), "utf-8");
    expect(command).toContain(PACKAGE_NAME);
    const manifest = JSON.parse(
      await readFile(path.join(projectDir, ".opencode", `${PACKAGE_NAME}.manifest.json`), "utf-8"),
    ) as { files: Record<string, string> };
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);
  });

  test("uninstall removes the registration and leaves a parseable config", async () => {
    const outcome = await runBun(
      [path.join(RENDERED_PACKAGE, "src", "cli.ts"), "uninstall"],
      projectDir,
      isolatedEnv(isolatedBase),
    );
    if (outcome.exitCode !== 0) failWithOutput("rendered package uninstall", outcome);
    expect(outcome.stdout).toContain("Removed plugin registration");

    const configText = await readFile(path.join(projectDir, "opencode.jsonc"), "utf-8");
    const verdict = validator.validateText(configText, true);
    expect(verdict.ok).toBe(true);
    expect(verdict.config?.plugins ?? []).not.toContain(`${PACKAGE_NAME}@latest`);
  }, 60_000);
});
