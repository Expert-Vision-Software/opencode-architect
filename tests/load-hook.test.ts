import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { Agent, Plugin } from "@opencode/plugin/effect";
import type { AgentEditor } from "@opencode/plugin/effect/agent";
import type { PermissionEvaluation } from "@opencode/plugin/effect/permission";
import { OpencodeArchitectPlugin } from "../src/plugin";
import { captureConsole } from "./test-helpers";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const REAL_AGENTS_DIR = path.join(REPO_ROOT, "agents");
const REAL_ASSETS_DIR = REPO_ROOT;

type RegisteredAgent = {
  id: string;
  mode: string;
  description: string;
  system: string;
  permissions: Array<{ action: string; resource: string; effect: string }>;
};

interface AgentDomainSpy {
  transform: (callback: (editor: AgentEditor) => void) => Effect.Effect<void>;
  registered: Map<string, RegisteredAgent>;
}

interface PermissionDomainSpy {
  hook: (
    name: "evaluate",
    callback: (input: PermissionEvaluation) => Effect.Effect<void>,
  ) => Effect.Effect<void>;
  evaluations: Array<(input: PermissionEvaluation) => Effect.Effect<void>>;
}

function blankAgent(id: string): RegisteredAgent {
  const created = Agent.Info.default(Agent.ID.make(id)) as Partial<RegisteredAgent> & {
    id: string;
    mode: string;
    permissions: Array<{ action: string; resource: string; effect: string }>;
  };
  return {
    id: created.id,
    mode: created.mode,
    description: created.description ?? "",
    system: created.system ?? "",
    permissions: [...created.permissions],
  };
}

function agentDomainSpy(): AgentDomainSpy {
  const registered = new Map<string, RegisteredAgent>();
  const transform = (callback: (editor: AgentEditor) => void) =>
    Effect.sync(() => {
      const editor: AgentEditor = {
        list: () => [...registered.values()] as never,
        get: (id: string) => registered.get(id) as never,
        default: () => {},
        update: (id: string, update: (agent: never) => void) => {
          const current = registered.get(id) ?? blankAgent(id);
          update(current as never);
          registered.set(id, current);
        },
        remove: (id: string) => {
          registered.delete(id);
        },
      };
      callback(editor);
    });
  return { transform, registered };
}

function permissionDomainSpy(): PermissionDomainSpy {
  const evaluations: Array<(input: PermissionEvaluation) => Effect.Effect<void>> = [];
  const hook = (
    _name: "evaluate",
    callback: (input: PermissionEvaluation) => Effect.Effect<void>,
  ) =>
    Effect.sync(() => {
      evaluations.push(callback);
    });
  return { hook, evaluations };
}

function contextWith(
  agent: AgentDomainSpy,
  permission: PermissionDomainSpy,
  directory: string,
): Plugin.Context {
  return { location: { directory }, agent, permission } as unknown as Plugin.Context;
}

async function activate(definition: Plugin.Plugin, context: Plugin.Context): Promise<void> {
  await Effect.runPromise(Effect.scoped(definition.effect(context)));
}

function pluginWith(agentsDir: string, assetsDir: string): Plugin.Plugin {
  return new OpencodeArchitectPlugin(agentsDir, assetsDir).toDefinition();
}

async function makeScratchDirs(): Promise<{ agentsDir: string; assetsDir: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-architect-hook-"));
  const agentsDir = path.join(root, "agents");
  const assetsDir = path.join(root, "assets");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  return { agentsDir, assetsDir };
}

describe("plugin activation (startup non-interference)", () => {
  let restoreWarnings: (() => void) | null = null;

  afterEach(() => {
    restoreWarnings?.();
    restoreWarnings = null;
  });

  function captureWarnings(): string[] {
    const captured = captureConsole("warn");
    restoreWarnings = captured.restore;
    return captured.lines;
  }

  test("missing bundled agents degrade to exactly one advisory instead of throwing", async () => {
    const { agentsDir, assetsDir } = await makeScratchDirs();
    const warnings = captureWarnings();
    const agent = agentDomainSpy();
    const permission = permissionDomainSpy();
    const context = contextWith(agent, permission, tmpdir());

    await activate(pluginWith(agentsDir, assetsDir), context);

    expect(agent.registered.size).toBe(0);
    expect(permission.evaluations.length).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("bunx opencode-architect clear-cache");
    expect(warnings[0]).toContain(path.join(".cache", "opencode", "npm", "opencode-architect@"));
    expect(warnings[0]).toContain("ENOENT");
  });

  test("the advisory fallback keeps a package-qualified cache path with a literal version placeholder", async () => {
    const { agentsDir, assetsDir } = await makeScratchDirs();
    const warnings = captureWarnings();
    const plugin = new OpencodeArchitectPlugin(agentsDir, assetsDir, async () => {
      throw new Error("unreadable package metadata");
    });

    await activate(plugin.toDefinition(), contextWith(agentDomainSpy(), permissionDomainSpy(), tmpdir()));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("opencode-architect@<version>");
    expect(warnings[0]).toContain("Cause: ENOENT");
  });

  test("repeated failing activations emit exactly one advisory", async () => {
    const { agentsDir, assetsDir } = await makeScratchDirs();
    const warnings = captureWarnings();
    const definition = pluginWith(agentsDir, assetsDir);
    const context = contextWith(agentDomainSpy(), permissionDomainSpy(), tmpdir());

    await activate(definition, context);
    await activate(definition, context);
    await activate(definition, context);

    expect(warnings).toHaveLength(1);
  });

  test("healthy assets register the agent suite with the evaluate hook and no warning", async () => {
    const warnings = captureWarnings();
    const plugin = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => true);
    const agent = agentDomainSpy();
    const permission = permissionDomainSpy();

    await activate(plugin.toDefinition(), contextWith(agent, permission, tmpdir()));

    expect(agent.registered.size).toBe(10);
    for (const registered of agent.registered.values()) {
      expect(registered.system.trim().length).toBeGreaterThan(0);
      expect(registered.mode === "subagent" || registered.mode === "primary").toBe(true);
    }
    expect(permission.evaluations.length).toBe(1);
    expect(warnings).toEqual([]);
  });

  test("registered agents keep the v2 permission ruleset translated from frontmatter", async () => {
    const plugin = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => true);
    const agent = agentDomainSpy();

    await activate(plugin.toDefinition(), contextWith(agent, permissionDomainSpy(), tmpdir()));

    const auditor = agent.registered.get("opencode-extension-auditor");
    expect(auditor).toBeDefined();
    const shellRules = (auditor?.permissions ?? []).filter((rule) => rule.action === "shell");
    expect(shellRules.some((rule) => rule.effect === "deny")).toBe(true);
    expect(shellRules.some((rule) => rule.resource === "bun test*" && rule.effect === "allow")).toBe(true);

    const architect = agent.registered.get("opencode-architect");
    expect((architect?.permissions ?? []).some((rule) => rule.action === "subagent")).toBe(true);
  });
});

describe("not-installed advisory (D5)", () => {
  let restoreLogs: (() => void) | null = null;
  let restoreWarnings: (() => void) | null = null;

  afterEach(() => {
    restoreLogs?.();
    restoreWarnings?.();
    restoreLogs = null;
    restoreWarnings = null;
  });

  function captureOutput(): { logs: string[]; warnings: string[] } {
    const logs = captureConsole("log");
    const warnings = captureConsole("warn");
    restoreLogs = logs.restore;
    restoreWarnings = warnings.restore;
    return { logs: logs.lines, warnings: warnings.lines };
  }

  test("fires once when no scope holds an install, then stays suppressed", async () => {
    const { logs } = captureOutput();
    let installed = false;
    const plugin = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => installed);
    const context = () => contextWith(agentDomainSpy(), permissionDomainSpy(), tmpdir());

    await activate(plugin.toDefinition(), context());
    await activate(plugin.toDefinition(), context());

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Not installed in any scope");
    expect(logs[0]).toContain("bunx opencode-architect install --scope global");

    installed = true;
    await activate(plugin.toDefinition(), context());
    expect(logs).toHaveLength(1);
  });

  test("fires independently of the failure advisory (separate once-guards)", async () => {
    const { logs, warnings } = captureOutput();
    const failing = new OpencodeArchitectPlugin(
      path.join(tmpdir(), "missing-agents-"),
      path.join(tmpdir(), "missing-assets-"),
    );
    await activate(failing.toDefinition(), contextWith(agentDomainSpy(), permissionDomainSpy(), tmpdir()));
    expect(warnings).toHaveLength(1);

    const healthy = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => false);
    await activate(healthy.toDefinition(), contextWith(agentDomainSpy(), permissionDomainSpy(), tmpdir()));

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Not installed in any scope");
  });

  test("never fires when a scope already holds an install", async () => {
    const { logs } = captureOutput();
    const plugin = new OpencodeArchitectPlugin(REAL_AGENTS_DIR, REAL_ASSETS_DIR, null, async () => true);
    const context = () => contextWith(agentDomainSpy(), permissionDomainSpy(), tmpdir());

    await activate(plugin.toDefinition(), context());
    await activate(plugin.toDefinition(), context());

    expect(logs).toEqual([]);
  });
});
