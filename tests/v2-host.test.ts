import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import * as Host from "@opencode/plugin/host";
import type { PermissionEvaluation } from "@opencode/plugin/effect/permission";
import { OpencodeArchitectPlugin } from "../src/plugin";
import { captureConsole } from "./test-helpers";
import { V2HostHarness } from "./v2-host-harness";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

async function makeInstalledPackage(layout: { exports: boolean; serverEntry: boolean }): Promise<string> {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "opencode-architect-host-pkg-"));
  const packageDir = path.join(cacheRoot, "node_modules", "opencode-architect");
  await mkdir(packageDir, { recursive: true });
  const manifest: Record<string, unknown> = {
    name: "opencode-architect",
    version: "0.0.0-harness",
    type: "module",
    module: "index.ts",
  };
  if (layout.exports) {
    manifest.exports = layout.serverEntry
      ? { ".": "./index.ts", "./server": "./server.ts" }
      : { ".": "./index.ts", "./server": "./index.ts" };
  }
  await writeFile(path.join(packageDir, "package.json"), JSON.stringify(manifest));
  await writeFile(
    path.join(packageDir, "index.ts"),
    "const plugin = { id: 'opencode-architect.harness-fixture', effect: () => Effect.void };\nexport default plugin;\n",
  );
  if (layout.serverEntry) {
    await writeFile(path.join(packageDir, "server.ts"), "export default { id: 'server-entry', effect: () => Effect.void };\n");
  }
  return cacheRoot;
}

async function makeEmptyPackage(): Promise<string> {
  const packageDir = await mkdtemp(path.join(tmpdir(), "opencode-architect-host-empty-"));
  await writeFile(path.join(packageDir, "package.json"), JSON.stringify({ name: "opencode-architect", type: "module" }));
  return packageDir;
}

describe("v2 host entrypoint resolution (facts §14.6)", () => {
  const harness = new V2HostHarness();

  test("the built package resolves through the ./server export from an installed-package layout", async () => {
    const mounted = await harness.mountInstalledLayout();
    try {
      const entrypoint = harness.resolveServerEntrypoint(mounted.cacheRoot, "opencode-architect");
      expect(entrypoint).not.toBeNull();
      expect(entrypoint?.replaceAll("\\", "/")).toContain("/index.ts");
    } finally {
      await mounted.dispose();
    }
  });

  test("a package exposing only the root index never yields a phantom server entrypoint (facts §14.6)", async () => {
    const cacheRoot = await makeInstalledPackage({ exports: false, serverEntry: false });
    try {
      const entrypoint = harness.resolveServerEntrypoint(cacheRoot, "opencode-architect");
      expect(entrypoint === null || entrypoint.replaceAll("\\", "/").endsWith("/index.ts")).toBe(true);
      let aggregate: { server?: string } | null = null;
      try {
        aggregate = Host.resolve({ directory: cacheRoot, name: "opencode-architect" });
      } catch {
        aggregate = null;
      }
      const aggregateServer = aggregate?.server;
      expect(
        aggregateServer === undefined || aggregateServer.replaceAll("\\", "/").endsWith("/index.ts"),
      ).toBe(true);
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });

  test("an explicit ./server export wins over the root index", async () => {
    const cacheRoot = await makeInstalledPackage({ exports: true, serverEntry: true });
    try {
      const entrypoint = harness.resolveServerEntrypoint(cacheRoot, "opencode-architect");
      expect(entrypoint?.replaceAll("\\", "/")).toContain("server.ts");
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });

  test("a package without any resolvable entrypoint surfaces as null, not a crash", async () => {
    const packageDir = await makeEmptyPackage();
    try {
      expect(harness.resolveServerEntrypoint(packageDir, null)).toBeNull();
    } finally {
      await rm(packageDir, { recursive: true, force: true });
    }
  });
});

describe("built plugin under the v2 host contract", () => {
  const harness = new V2HostHarness();
  let mounted: Awaited<ReturnType<typeof harness.mountInstalledLayout>>;

  beforeAll(async () => {
    mounted = await harness.mountInstalledLayout();
  });

  afterAll(async () => {
    if (!mounted) return;
    await mounted.dispose();
  });

  test("the built entry satisfies the v2 Module contract through the real host loader", async () => {
    const { check } = await harness.loadInstalled(mounted.cacheRoot);
    expect(check.violation).toBeNull();
    expect(check.effectKind).toBe("effect");
    expect(check.id).toBe("opencode-architect");
    expect(check.entrypoint.replaceAll("\\", "/")).toContain("/index.ts");
  });

  test("activation registers the full agent suite and the permission evaluate hook", async () => {
    const logs = captureConsole("log");
    const warnings = captureConsole("warn");
    const { definition } = await harness.loadInstalled(mounted.cacheRoot);
    const recording = harness.recordingContext(tmpdir());

    await harness.activate(definition, recording);

    const audit = harness.audit(recording, "opencode-architect", true);
    expect(audit.violations).toEqual([]);
    expect(audit.agentsRegistered).toHaveLength(10);
    expect(audit.permissionHookCount).toBe(1);
    for (const name of audit.agentsRegistered) {
      const record = recording.agents.get(name) as { mode: string; permissions: unknown[] };
      expect(["subagent", "primary"]).toContain(record.mode);
      expect(record.permissions.length).toBeGreaterThanOrEqual(0);
    }
    expect(audit.agentsRegistered).toContain("opencode-architect");
    expect(audit.agentsRegistered).toContain("opencode-skill-creator");
    expect(audit.skillsRegistered).toEqual(["opencode-v2-upgrade"]);
    expect(audit.commandsRegistered).toEqual(["upgrade-opencode-v2"]);
    logs.restore();
    warnings.restore();
  });

  test("the registered evaluate hook rewrites bundled external_directory asks end to end", async () => {
    const logs = captureConsole("log");
    const warnings = captureConsole("warn");
    const { definition } = await harness.loadInstalled(mounted.cacheRoot);
    const recording = harness.recordingContext(tmpdir());
    await harness.activate(definition, recording);

    const evaluate = recording.permissionHooks[0];
    if (!evaluate) throw new Error("permission evaluate hook was not registered");
    const input = {
      sessionID: "ses_harness",
      action: "external_directory",
      resources: [path.join(REPO_ROOT, "agents", "opencode-architect.md")],
      effect: "ask",
    } as unknown as PermissionEvaluation;

    await Effect.runPromise(evaluate(input));

    expect(input.effect).toBe("allow");
    logs.restore();
    warnings.restore();
  });
});

describe("the harness fails on registration loss", () => {
  const harness = new V2HostHarness();

  test("a plugin whose suite fails to load produces audit violations instead of a silent pass", async () => {
    const warnings = captureConsole("warn");
    const scratch = await mkdtemp(path.join(tmpdir(), "opencode-architect-host-loss-"));
    const definition = new OpencodeArchitectPlugin(path.join(scratch, "missing-agents"), scratch).toDefinition();
    const recording = harness.recordingContext(tmpdir());

    await harness.activate(definition, recording);

    const audit = harness.audit(recording, "opencode-architect", true);
    expect(audit.agentsRegistered).toHaveLength(0);
    expect(audit.permissionHookCount).toBe(0);
    expect(audit.violations.length).toBeGreaterThanOrEqual(10);
    expect(audit.violations).toContain("permission evaluate hook registered 0 times, expected 1");
    expect(audit.violations).toContain("skill not registered: opencode-v2-upgrade");
    expect(audit.violations).toContain("command not registered: upgrade-opencode-v2");
    expect(audit.missingAgents).toContain("opencode-architect");
    expect(warnings.lines[0]).toContain("bunx opencode-architect clear-cache");
    await rm(scratch, { recursive: true, force: true });
    warnings.restore();
  });

  test("a package that fails entrypoint resolution is a violation, not a skip", async () => {
    const packageDir = await makeEmptyPackage();
    try {
      const entrypoint = harness.resolveServerEntrypoint(packageDir, null);
      const recording = harness.recordingContext(tmpdir());
      const audit = harness.audit(recording, "opencode-architect", entrypoint !== null);
      expect(audit.entrypointResolved).toBe(false);
      expect(audit.violations).toContain("plugin entrypoint did not resolve under Host.resolve");
    } finally {
      await rm(packageDir, { recursive: true, force: true });
    }
  });
});
