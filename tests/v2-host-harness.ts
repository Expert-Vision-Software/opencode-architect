import path from "node:path";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Effect, Schema } from "effect";
import { resolveModule } from "@opencode/util/runtime-import";
import * as Host from "@opencode/plugin/host";
import { Agent, Plugin } from "@opencode/plugin/effect";
import type { AgentEditor } from "@opencode/plugin/effect/agent";
import type { CommandEditor } from "@opencode/plugin/effect/command";
import type { PermissionEvaluation } from "@opencode/plugin/effect/permission";
import type { SkillEditor } from "@opencode/plugin/effect/skill";
import { AGENT_FILENAMES } from "../src/agent-loader";
import { COMMAND_FILENAMES } from "../src/command-loader";
import { SKILL_DIRECTORIES } from "../src/skill-loader";
import { flattenIssue } from "./config-schema-validator";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_NAME = "opencode-architect";
const SERVER_SUBPATHS = ["server", ""] as const;
const IGNORED_RESOLUTION_CODES = new Set([
  "ENOENT",
  "ENOTDIR",
  "MODULE_NOT_FOUND",
  "ERR_MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_UNSUPPORTED_DIR_IMPORT",
]);

export interface ModuleContractCheck {
  entrypoint: string;
  id: string;
  effectKind: "effect" | "setup" | null;
  violation: string | null;
}

export interface HostAgentRecord {
  id: string;
  name: string;
  mode: string;
  system: string;
  description: string;
  permissions: Array<{ action: string; resource: string; effect: string }>;
  schemaIssue: string | null;
}

export interface RegistrationAudit {
  pluginId: string;
  entrypointResolved: boolean;
  agentsExpected: string[];
  agentsRegistered: string[];
  missingAgents: string[];
  unexpectedAgents: string[];
  skillsExpected: string[];
  skillsRegistered: string[];
  missingSkills: string[];
  commandsExpected: string[];
  commandsRegistered: string[];
  missingCommands: string[];
  permissionHookCount: number;
  violations: string[];
}

export interface RecordingContext {
  context: Plugin.Context;
  agents: Map<string, unknown>;
  skills: Map<string, unknown>;
  commands: Map<string, unknown>;
  permissionHooks: Array<(input: PermissionEvaluation) => Effect.Effect<void>>;
}

const SUITE_MODES = new Set(["subagent", "primary"]);
const PERMISSION_EFFECTS = new Set(["allow", "ask", "deny"]);
const decodeAgentInfo = Schema.decodeUnknownResult(Agent.Info);

export class V2HostHarness {
  public suiteAgentNames(): string[] {
    return AGENT_FILENAMES.map((filename) => path.basename(filename, ".md"));
  }

  public suiteSkillNames(): string[] {
    return [...SKILL_DIRECTORIES];
  }

  public suiteCommandNames(): string[] {
    return COMMAND_FILENAMES.map((filename) => path.basename(filename, ".md"));
  }

  public resolveServerEntrypoint(directory: string, name: string | null): string | null {
    try {
      return resolveServerKindEntrypoint(directory, name);
    } catch {
      return null;
    }
  }

  public async mountInstalledLayout(): Promise<{ cacheRoot: string; dispose: () => Promise<void> }> {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), "opencode-architect-host-cache-"));
    const linkPath = path.join(cacheRoot, "node_modules", PACKAGE_NAME);
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(REPO_ROOT, linkPath, process.platform === "win32" ? "junction" : "dir");
    return { cacheRoot, dispose: () => rm(cacheRoot, { recursive: true, force: true }) };
  }

  public async loadInstalled(cacheRoot: string): Promise<{ definition: Plugin.Plugin; check: ModuleContractCheck }> {
    const entrypoint = this.resolveServerEntrypoint(cacheRoot, PACKAGE_NAME);
    if (entrypoint === null) {
      throw new Error(`Host.resolve found no server entrypoint for ${PACKAGE_NAME} under ${cacheRoot}`);
    }
    const loaded = (await Host.load(entrypoint)) as { default: unknown };
    const check = this.moduleContract(loaded, entrypoint);
    if (check.violation !== null) throw new Error(`Built entry violates the v2 Module contract: ${check.violation}`);
    return { definition: loaded.default as Plugin.Plugin, check };
  }

  public moduleContract(loaded: unknown, entrypoint: string): ModuleContractCheck {
    const definition = (loaded as { default?: unknown } | null)?.default;
    if (definition === null || typeof definition !== "object") {
      return { entrypoint, id: "", effectKind: null, violation: "module default export is not an object" };
    }
    const candidate = definition as { id?: unknown; effect?: unknown; setup?: unknown };
    if (typeof candidate.id !== "string" || candidate.id.length === 0) {
      return { entrypoint, id: "", effectKind: null, violation: "definition id is not a non-empty string" };
    }
    if (typeof candidate.effect === "function") {
      return { entrypoint, id: candidate.id, effectKind: "effect", violation: null };
    }
    if (typeof candidate.setup === "function") {
      return { entrypoint, id: candidate.id, effectKind: "setup", violation: null };
    }
    return { entrypoint, id: candidate.id, effectKind: null, violation: "definition has neither effect nor setup function" };
  }

  public recordingContext(directory: string): RecordingContext {
    const agents = new Map<string, unknown>();
    const skills = new Map<string, unknown>();
    const commands = new Map<string, unknown>();
    const permissionHooks: Array<(input: PermissionEvaluation) => Effect.Effect<void>> = [];
    const context = {
      location: { directory },
      agent: { transform: (callback: (editor: AgentEditor) => void) => Effect.sync(() => callback(recordingAgentEditor(agents))) },
      skill: { transform: (callback: (editor: SkillEditor) => void) => Effect.sync(() => callback(recordingSkillEditor(skills))) },
      command: { transform: (callback: (editor: CommandEditor) => void) => Effect.sync(() => callback(recordingCommandEditor(commands))) },
      permission: {
        hook: (_name: string, callback: (input: PermissionEvaluation) => Effect.Effect<void>) =>
          Effect.sync(() => {
            permissionHooks.push(callback);
          }),
      },
    } as unknown as Plugin.Context;
    return { context, agents, skills, commands, permissionHooks };
  }

  public activate(definition: Plugin.Plugin, recording: RecordingContext): Promise<void> {
    return Effect.runPromise(Effect.scoped(definition.effect(recording.context)));
  }

  public audit(recording: RecordingContext, pluginId: string, entrypointResolved: boolean): RegistrationAudit {
    const agentsExpected = this.suiteAgentNames();
    const agentsRegistered = [...recording.agents.keys()];
    const skillsExpected = this.suiteSkillNames();
    const skillsRegistered = [...recording.skills.keys()];
    const commandsExpected = this.suiteCommandNames();
    const commandsRegistered = [...recording.commands.keys()];
    const audit: RegistrationAudit = {
      pluginId,
      entrypointResolved,
      agentsExpected,
      agentsRegistered,
      missingAgents: agentsExpected.filter((name) => !recording.agents.has(name)),
      unexpectedAgents: agentsRegistered.filter((name) => !agentsExpected.includes(name)),
      skillsExpected,
      skillsRegistered,
      missingSkills: skillsExpected.filter((name) => !recording.skills.has(name)),
      commandsExpected,
      commandsRegistered,
      missingCommands: commandsExpected.filter((name) => !recording.commands.has(name)),
      permissionHookCount: recording.permissionHooks.length,
      violations: [],
    };
    if (!entrypointResolved) audit.violations.push("plugin entrypoint did not resolve under Host.resolve");
    for (const name of audit.missingAgents) audit.violations.push(`agent not registered: ${name}`);
    for (const name of audit.unexpectedAgents) audit.violations.push(`unexpected agent registered: ${name}`);
    for (const name of agentsRegistered) this.auditAgent(audit, name, recording.agents.get(name));
    for (const name of audit.missingSkills) audit.violations.push(`skill not registered: ${name}`);
    for (const name of audit.missingCommands) audit.violations.push(`command not registered: ${name}`);
    if (recording.permissionHooks.length !== 1) {
      audit.violations.push(`permission evaluate hook registered ${recording.permissionHooks.length} times, expected 1`);
    }
    if (pluginId !== "opencode-architect") audit.violations.push(`plugin id is "${pluginId}", expected "opencode-architect"`);
    return audit;
  }

  private auditAgent(audit: RegistrationAudit, name: string, record: unknown): void {
    const agent = normalizeAgent(record);
    const decoded = decodeAgentInfo(record);
    if (decoded._tag !== "Success") {
      agent.schemaIssue = flattenIssue(decoded.failure);
      audit.violations.push(`agent ${name} does not decode against @opencode/schema Agent.Info: ${agent.schemaIssue}`);
    }
    if (!SUITE_MODES.has(agent.mode)) audit.violations.push(`agent ${name} has unsupported mode "${agent.mode}"`);
    if (agent.system.trim().length === 0) audit.violations.push(`agent ${name} has an empty system prompt`);
    if (agent.description.trim().length === 0) audit.violations.push(`agent ${name} has an empty description`);
    for (const rule of agent.permissions) {
      if (!PERMISSION_EFFECTS.has(rule.effect)) {
        audit.violations.push(`agent ${name} permission rule ${rule.action} has invalid effect "${rule.effect}"`);
      }
    }
  }
}

function resolveServerKindEntrypoint(directory: string, name: string | null): string | null {
  for (const subpath of SERVER_SUBPATHS) {
    const specifier =
      name === null ? path.resolve(directory, subpath || "index") : [name, subpath].filter(Boolean).join("/");
    try {
      return resolveModule(specifier, directory);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || !IGNORED_RESOLUTION_CODES.has(String(error.code))) {
        throw error;
      }
    }
  }
  return null;
}

function recordingAgentEditor(registered: Map<string, unknown>): AgentEditor {
  return {
    list: () => [...registered.values()] as never,
    get: (id: string) => registered.get(id) as never,
    default: (id: string | undefined) => {
      if (typeof id === "string") registered.set(id, Agent.Info.default(Agent.ID.make(id)));
    },
    update: (id: string, update: (agent: never) => void) => {
      const current = registered.get(id) ?? Agent.Info.default(Agent.ID.make(id));
      update(current as never);
      registered.set(id, current);
    },
    remove: (id: string) => {
      registered.delete(id);
    },
  };
}

function recordingSkillEditor(registered: Map<string, unknown>): SkillEditor {
  return {
    list: () => [...registered.values()] as never,
    get: (id: string) => registered.get(id) as never,
    add: (skill) => {
      registered.set(skill.id, skill);
    },
    update: (id: string, update: (skill: never) => void) => {
      const current = registered.get(id);
      if (current === undefined) return;
      update(current as never);
    },
    remove: (id: string) => {
      registered.delete(id);
    },
  };
}

function recordingCommandEditor(registered: Map<string, unknown>): CommandEditor {
  return {
    add: (definition) => {
      registered.set(definition.name, definition);
    },
  };
}

function normalizeAgent(record: unknown): HostAgentRecord {
  const candidate = (record ?? {}) as Partial<HostAgentRecord>;
  return {
    id: candidate.id ?? "",
    name: candidate.name ?? "",
    mode: candidate.mode ?? "",
    system: candidate.system ?? "",
    description: candidate.description ?? "",
    permissions: Array.isArray(candidate.permissions) ? candidate.permissions : [],
    schemaIssue: null,
  };
}
