import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConfigReader } from "../src/config-reader";
import { EntryPredicate } from "../src/entry-predicate";
import { Installer } from "../src/installer";
import { LoadedVersionResolver } from "../src/loaded-version";
import { StatusReporter } from "../src/status-reporter";

let projectDir = "";
let configDir = "";
let cacheDir = "";
let originalXdgConfig: string | undefined;
let originalXdgCache: string | undefined;
const installer = new Installer();
const reporter = new StatusReporter(installer);

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "oa-status-project-"));
  configDir = await mkdtemp(path.join(tmpdir(), "oa-status-config-"));
  cacheDir = await mkdtemp(path.join(tmpdir(), "oa-status-cache-"));
  originalXdgConfig = process.env.XDG_CONFIG_HOME;
  originalXdgCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CONFIG_HOME = configDir;
  process.env.XDG_CACHE_HOME = cacheDir;
});

afterEach(async () => {
  restoreEnv("XDG_CONFIG_HOME", originalXdgConfig);
  restoreEnv("XDG_CACHE_HOME", originalXdgCache);
  await rm(projectDir, { recursive: true, force: true });
  await rm(configDir, { recursive: true, force: true });
  await rm(cacheDir, { recursive: true, force: true });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function cacheRoot(): string {
  return path.join(cacheDir, "opencode", "npm");
}

async function seedCacheCopy(
  key: string,
  packageName: string,
  version: string,
  generation: string = "1738848000000",
): Promise<string> {
  const dir = path.join(cacheRoot(), key, generation, "node_modules", packageName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: packageName, version }));
  return dir;
}

async function writeConfig(scope: "local" | "global", file: string, text: string): Promise<string> {
  const base = scope === "local" ? path.join(projectDir, ".opencode") : path.join(configDir, "opencode");
  const target = path.join(base, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
  return target;
}

async function writeLocalManifest(version: string, configPath: string | null): Promise<void> {
  const target = path.join(projectDir, ".opencode", "opencode-architect.manifest.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    JSON.stringify({ version, mode: "plugin", entry: "opencode-architect@latest", configPath, "content-hash": null, hashes: null }),
  );
}

describe("LoadedVersionResolver classification", () => {
  const resolver = new LoadedVersionResolver();

  test("classifies npm specs, pinning, scopes, and defaults", () => {
    expect(resolver.classify("opencode-architect@latest")).toMatchObject({
      form: "npm",
      name: "opencode-architect",
      version: "latest",
    });
    expect(resolver.classify("opencode-architect")).toMatchObject({
      form: "npm",
      name: "opencode-architect",
      version: "latest",
    });
    expect(resolver.classify("opencode-architect@1.0.0")).toMatchObject({ version: "1.0.0" });
    expect(resolver.classify("@scope/pkg@^1.7.0")).toMatchObject({ name: "@scope/pkg", version: "^1.7.0" });
  });

  test("classifies path forms and record forms", () => {
    expect(resolver.classify("file:///tmp/plugin")).toMatchObject({ form: "path" });
    expect(resolver.classify("./plugin")).toMatchObject({ form: "path" });
    expect(resolver.classify("some/dir")).toMatchObject({ form: "path" });
    expect(resolver.classify({ package: "opencode-architect@1.0.0" })).toMatchObject({
      form: "npm",
      version: "1.0.0",
    });
    expect(resolver.classify(42)).toBeNull();
  });

  test("returns null for a spec whose version carries a path separator", () => {
    expect(resolver.classify("foo@bar/baz")).toBeNull();
    expect(resolver.classify("foo@bar\\baz")).toBeNull();
    expect(resolver.classify({ package: "foo@bar/baz" })).toBeNull();
  });

  test("reports an unhandled entry for a malformed version spec", async () => {
    const result = await resolver.resolve("foo@bar/baz");

    expect(result.status).toBe("unhandled");
  });
});

describe("EntryPredicate", () => {
  test("specOf unwraps record entries and trims strings", () => {
    expect(EntryPredicate.specOf({ package: " a@1 " })).toBe("a@1");
    expect(EntryPredicate.specOf(42)).toBeNull();
    expect(EntryPredicate.specOf(null)).toBeNull();
  });

  test("baseName strips the version spec", () => {
    expect(EntryPredicate.baseName("@scope/pkg@1.0.0")).toBe("@scope/pkg");
    expect(EntryPredicate.baseName("pkg")).toBe("pkg");
  });
});

describe("StatusReporter.formatAge", () => {
  test("formats elapsed time as a relative hint", () => {
    const now = Date.now();
    expect(StatusReporter.formatAge(null)).toBeNull();
    expect(StatusReporter.formatAge(now - 30_000)).toBe("just now");
    expect(StatusReporter.formatAge(now - 5 * 60_000)).toBe("5m old");
    expect(StatusReporter.formatAge(now - 2 * 3_600_000)).toBe("2h old");
    expect(StatusReporter.formatAge(now - 3 * 86_400_000)).toBe("3d old");
  });
});

describe("LoadedVersionResolver cache resolution", () => {
  const resolver = new LoadedVersionResolver();

  test("resolves a present cache copy and reports version and mtime", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.2.3");

    const result = await resolver.resolve("opencode-architect@latest");

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.source.version).toBe("1.2.3");
      expect(result.source.source).toBe("cache");
      expect(result.source.modifiedMs).toBeGreaterThan(0);
    }
  });

  test("distinguishes pinned and @latest keys", async () => {
    await seedCacheCopy("opencode-architect@1.0.0", "opencode-architect", "1.0.0");
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.2.0");

    const pinned = await resolver.resolve("opencode-architect@1.0.0");
    const latest = await resolver.resolve("opencode-architect@latest");

    expect(pinned.status === "resolved" && pinned.source.version).toBe("1.0.0");
    expect(latest.status === "resolved" && latest.source.version).toBe("1.2.0");
  });

  test("reports a missing cache key", async () => {
    const result = await resolver.resolve("opencode-architect@latest");

    expect(result.status).toBe("missing");
    if (result.status === "missing") expect(result.attempted).toContain("opencode-architect@latest");
  });

  test("reports a partial cache key with no extracted copy", async () => {
    await mkdir(path.join(cacheRoot(), "opencode-architect@latest", ".staging-123"), { recursive: true });

    const result = await resolver.resolve("opencode-architect@latest");

    expect(result.status).toBe("partial");
  });

  test("picks the newest generation when several are cached", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.0.0", "1700000000000");
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "2.0.0", "1790000000000");

    const result = await resolver.resolve("opencode-architect@latest");

    expect(result.status === "resolved" && result.source.version).toBe("2.0.0");
  });

  test("resolves a path entry and a record-form path entry to the checkout", async () => {
    const checkout = path.join(projectDir, "checkout");
    await mkdir(checkout, { recursive: true });
    await writeFile(path.join(checkout, "package.json"), JSON.stringify({ name: "opencode-architect", version: "3.4.5" }));
    const entry = pathToFileURL(checkout).href;

    const direct = await resolver.resolve(entry);
    const record = await resolver.resolve({ package: entry });

    expect(direct.status === "resolved" && direct.source.source).toBe("checkout");
    expect(direct.status === "resolved" && direct.source.version).toBe("3.4.5");
    expect(record.status === "resolved" && record.source.version).toBe("3.4.5");
  });

  test("reports a path entry that does not resolve", async () => {
    const result = await resolver.resolve(path.join(projectDir, "missing-checkout"));

    expect(result.status).toBe("missing");
  });
});

describe("ConfigReader.entries", () => {
  test("reads raw entries from a jsonc config with comments and trailing commas", async () => {
    await writeConfig(
      "local",
      "opencode.jsonc",
      '{\n  // keep\n  "plugins": ["other", { "package": "opencode-architect@latest" },],\n}\n',
    );

    const entries = await new ConfigReader().entries("local", projectDir);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.rawEntries).toContain("other");
    expect(entries[0]?.rawEntries).toContainEqual({ package: "opencode-architect@latest" });
    expect(entries[0]?.parseError).toBeNull();
  });

  test("reports candidates with path, leniency, writability, and legacy key entries", async () => {
    await writeConfig(
      "local",
      "opencode.json",
      '{ "plugins": ["a"], "plugin": ["legacy"] }',
    );

    const entries = await new ConfigReader().entries("local", projectDir);

    const json = entries.find((candidate) => candidate.path.endsWith("opencode.json"));
    expect(json?.lenient).toBe(false);
    expect(json?.writable).toBe(true);
    expect(json?.rawEntries).toEqual(["a", "legacy"]);
  });

  test("warns and reports unparseable configs", async () => {
    await writeConfig("local", "opencode.json", "{ not json ]");
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(message);
    const entries = await new ConfigReader().entries("local", projectDir, warn);
    expect(entries[0]?.parseError).not.toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not be parsed");
  });
});

describe("StatusReporter registration detection", () => {
  test("reports none for an empty scope", async () => {
    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(false);
    expect(report.scopes[0]?.mode).toBe("none");
    expect(report.scopes[0]?.manifestVersion).toBeNull();
    expect(report.scopes[0]?.resolved).toBeNull();
  });

  test("reports the manifest version and registration file for a live registration", async () => {
    const configPath = await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');
    await writeLocalManifest("9.9.9", configPath);

    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(true);
    expect(report.scopes[0]?.mode).toBe("plugin");
    expect(report.scopes[0]?.manifestVersion).toBe("9.9.9");
    expect(report.scopes[0]?.configPath).toBe(configPath);
  });

  test("a manifest without a live registration reports unregistered with the recorded version", async () => {
    const configPath = await writeConfig("local", "opencode.json", "{}\n");
    await writeLocalManifest("9.9.9", configPath);

    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(false);
    expect(report.scopes[0]?.manifestVersion).toBe("9.9.9");
    expect(report.effective.scope).toBeNull();
  });

  test("detects an npm registration without a manifest", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect"] }\n');

    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(true);
    expect(report.scopes[0]?.manifestVersion).toBeNull();
    expect(report.scopes[0]?.entryForm).toBe("npm");
  });

  test("detects a path-form registration without a manifest", async () => {
    const entry = pathToFileURL(path.resolve(import.meta.dirname, "..")).href;
    await writeConfig("local", "opencode.json", `{ "plugins": [{ "package": "${entry}" }] }\n`);

    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(true);
    expect(report.scopes[0]?.entryForm).toBe("path");
  });

  test("detects a string path-form registration without a manifest", async () => {
    const entry = pathToFileURL(path.resolve(import.meta.dirname, "..")).href;
    await writeConfig("local", "opencode.json", `{ "plugins": ["${entry}"] }\n`);

    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(true);
    expect(report.scopes[0]?.entryForm).toBe("path");
  });

  test("a relative path entry resolves from the config file's directory", async () => {
    const checkout = path.join(projectDir, "checkout");
    await mkdir(checkout, { recursive: true });
    await writeFile(
      path.join(checkout, "package.json"),
      JSON.stringify({ name: "opencode-architect", version: "3.4.5" }),
    );
    const relative = path.relative(path.join(projectDir, ".opencode"), checkout).replaceAll("\\", "/");
    await writeConfig("local", "opencode.json", `{ "plugins": ["${relative}"] }\n`);

    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(true);
    expect(report.scopes[0]?.resolved?.version).toBe("3.4.5");
    expect(report.scopes[0]?.resolved?.source).toBe("checkout");
  });

  test("detects a legacy v1 registration without a manifest", async () => {
    await writeConfig("local", "opencode.json", '{ "plugin": ["opencode-architect"] }\n');

    const report = await reporter.report(projectDir, { scopes: ["local"], online: false });

    expect(report.scopes[0]?.registered).toBe(true);
  });

  test("--package matches a differently named npm registration", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["aurelia-expert@latest"] }\n');

    const report = await reporter.report(projectDir, {
      scopes: ["local"],
      online: false,
      packageName: "aurelia-expert",
    });

    expect(report.packageName).toBe("aurelia-expert");
    expect(report.scopes[0]?.registered).toBe(true);
    expect(report.scopes[0]?.entryName).toBe("aurelia-expert");
  });

  test("--package does not match this package's registration", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');

    const report = await reporter.report(projectDir, {
      scopes: ["local"],
      online: false,
      packageName: "aurelia-expert",
    });

    expect(report.scopes[0]?.registered).toBe(false);
  });

  test("--package reads the named manifest rather than this package's", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["aurelia-expert@latest"] }\n');
    const manifest = path.join(projectDir, ".opencode", "aurelia-expert.manifest.json");
    await mkdir(path.dirname(manifest), { recursive: true });
    await writeFile(
      manifest,
      JSON.stringify({ version: "9.9.9", mode: "plugin", entry: "aurelia-expert@latest", configPath: null, "content-hash": null, hashes: null }),
    );

    const report = await reporter.report(projectDir, {
      scopes: ["local"],
      online: false,
      packageName: "aurelia-expert",
    });

    expect(report.scopes[0]?.manifestVersion).toBe("9.9.9");
    expect(report.scopes[0]?.mode).toBe("plugin");
  });
});

describe("StatusReporter.report", () => {
  test("reports per-scope resolution and an effective verdict", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.0.0");
    await writeConfig("local", "opencode.jsonc", '{ "plugins": ["opencode-architect@latest"] }\n');

    const report = await reporter.report(projectDir, { scopes: null, online: false });

    const local = report.scopes.find((scope) => scope.scope === "local");
    expect(local?.registered).toBe(true);
    expect(local?.resolved?.version).toBe("1.0.0");
    expect(report.effective.version).toBe("1.0.0");
    expect(report.effective.versionKind).toBe("cache");
    expect(report.effective.scope).toBe("local");
    expect(report.effective.registeredScopes).toEqual(["local"]);
  });

  test("a pinned spec answers the verdict even when no copy is cached", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@1.0.0"] }\n');

    const report = await reporter.report(projectDir, { scopes: null, online: false });

    expect(report.effective.version).toBe("1.0.0");
    expect(report.effective.versionKind).toBe("spec");
  });

  test("@latest with --online answers the verdict with the published version", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');
    const stubFetch = ((input: string | URL | Request) =>
      Promise.resolve(new Response(JSON.stringify({ version: "2.0.0" }), { status: 200 }))) as unknown as typeof fetch;

    const report = await new StatusReporter(installer, stubFetch).report(projectDir, { scopes: null, online: true });

    expect(report.effective.version).toBe("2.0.0");
    expect(report.effective.versionKind).toBe("npm");
  });

  test("a range spec stays unresolved without a cached copy", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@^1.7.0"] }\n');

    const report = await reporter.report(projectDir, { scopes: null, online: false });

    expect(report.effective.version).toBeNull();
    expect(report.effective.versionKind).toBeNull();
  });

  test("--package resolves a path-form registration for another checkout", async () => {
    const checkout = path.join(projectDir, "aurelia-checkout");
    await mkdir(checkout, { recursive: true });
    await writeFile(
      path.join(checkout, "package.json"),
      JSON.stringify({ name: "aurelia-expert", version: "3.0.0" }),
    );
    await writeConfig("local", "opencode.json", `{ "plugins": [{ "package": "${pathToFileURL(checkout).href}" }] }\n`);

    const report = await reporter.report(projectDir, {
      scopes: ["local"],
      online: false,
      packageName: "aurelia-expert",
    });

    expect(report.scopes[0]?.registered).toBe(true);
    expect(report.effective.version).toBe("3.0.0");
    expect(report.effective.versionKind).toBe("checkout");
  });

  test("warns when registered in both scopes and annotates the verdict", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.0.0");
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');
    await writeConfig("global", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');

    const report = await reporter.report(projectDir, { scopes: null, online: false });

    expect(report.scopes.filter((scope) => scope.registered)).toHaveLength(2);
    expect(report.warnings.join("\n")).toContain("double-load risk");
    expect(report.effective.registeredScopes).toEqual(["local", "global"]);
  });

  test("warns when the manifest version differs from the resolved copy", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "2.0.0");
    const configPath = await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');
    await writeLocalManifest("1.0.0", configPath);

    const report = await reporter.report(projectDir, { scopes: null, online: false });

    expect(report.scopes[0]?.warnings.join("\n")).toContain("manifest records 1.0.0");
  });

  test("warns when no cached copy exists for the registered spec", async () => {
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@0.4.0"] }\n');

    const report = await reporter.report(projectDir, { scopes: null, online: false });

    expect(report.scopes[0]?.warnings.join("\n")).toContain("no cached copy");
  });

  test("narrows to a single scope when asked", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.0.0");
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');
    await writeConfig("global", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');

    const report = await reporter.report(projectDir, { scopes: ["global"], online: false });

    expect(report.scopes).toHaveLength(1);
    expect(report.scopes[0]?.scope).toBe("global");
    expect(report.warnings).toEqual([]);
  });

  test("--online reports the published latest and flags staleness", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.0.0");
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');
    const stubFetch = ((input: string | URL | Request) =>
      Promise.resolve(new Response(JSON.stringify({ version: "2.0.0" }), { status: 200 }))) as unknown as typeof fetch;

    const report = await new StatusReporter(installer, stubFetch).report(projectDir, { scopes: null, online: true });

    expect(report.scopes[0]?.publishedVersion).toBe("2.0.0");
    expect(report.effective.latestVersion).toBe("2.0.0");
    expect(report.warnings.join("\n")).toContain("stale");
  });

  test("--online derives the npm name for a path-form registration from the checkout", async () => {
    const checkout = path.join(projectDir, "checkout");
    await mkdir(checkout, { recursive: true });
    await writeFile(
      path.join(checkout, "package.json"),
      JSON.stringify({ name: "opencode-architect", version: "3.4.5" }),
    );
    const entry = pathToFileURL(checkout).href;
    await writeConfig("local", "opencode.json", `{ "plugins": [{ "package": "${entry}" }] }\n`);
    const stubFetch = ((input: string | URL | Request) =>
      Promise.resolve(new Response(JSON.stringify({ version: "2.0.0" }), { status: 200 }))) as unknown as typeof fetch;

    const report = await new StatusReporter(installer, stubFetch).report(projectDir, { scopes: null, online: true });

    expect(report.scopes[0]?.entryForm).toBe("path");
    expect(report.scopes[0]?.publishedVersion).toBe("2.0.0");
    expect(report.effective.latestVersion).toBe("2.0.0");
    expect(report.warnings.join("\n")).toContain("resolves 3.4.5 but npm publishes 2.0.0");
  });

  test("--online warn-and-continues when the registry is unreachable", async () => {
    await seedCacheCopy("opencode-architect@latest", "opencode-architect", "1.0.0");
    await writeConfig("local", "opencode.json", '{ "plugins": ["opencode-architect@latest"] }\n');
    const failingFetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const report = await new StatusReporter(installer, failingFetch).report(projectDir, { scopes: null, online: true });

    expect(report.scopes[0]?.publishedVersion).toBeNull();
    expect(report.effective.version).toBe("1.0.0");
    expect(report.warnings.join("\n")).toContain("could not query npm registry");
  });
});
