import { readFile } from "node:fs/promises";
import path from "node:path";
import { Effect, type Scope } from "effect";
import { Plugin, Skill } from "@opencode/plugin/effect";
import type { AgentEditor } from "@opencode/plugin/effect/agent";
import type { CommandDefinition, CommandInvocation } from "@opencode/plugin/effect/command";
import { AgentLoader, type LoadedAgent } from "./agent-loader";
import { AssetPermissionAdvisor } from "./asset-permission-advisor";
import { CommandLoader, type LoadedCommand } from "./command-loader";
import { Installer } from "./installer";
import { NpmCache } from "./core/npm-cache";
import { SkillLoader, UPGRADE_SKILL_ID, type LoadedSkill } from "./skill-loader";

const PACKAGE_NAME = "opencode-architect";
const PLUGIN_ID = "opencode-architect";

interface BundledContent {
  agents: Record<string, LoadedAgent>;
  skills: LoadedSkill[];
  commands: LoadedCommand[];
}

export class OpencodeArchitectPlugin {
  private readonly agentsDir: string;
  private readonly skillsDir: string;
  private readonly commandsDir: string;
  private readonly assetsDir: string;
  private readonly readVersion: () => Promise<string>;
  private readonly hasInstall: (projectDir: string) => Promise<boolean>;
  private readonly advisor: AssetPermissionAdvisor;
  private failureAdvised = false;
  private notInstalledAdvised = false;

  constructor(
    agentsDir: string | null = null,
    assetsDir: string | null = null,
    readVersion: (() => Promise<string>) | null = null,
    hasInstall: ((projectDir: string) => Promise<boolean>) | null = null,
  ) {
    this.assetsDir = assetsDir ?? path.join(import.meta.dirname, "..");
    this.agentsDir = agentsDir ?? path.join(this.assetsDir, "agents");
    this.skillsDir = path.join(this.assetsDir, "skills");
    this.commandsDir = path.join(this.assetsDir, "commands");
    this.readVersion = readVersion ?? (() => this.readPackageMetadata());
    this.hasInstall = hasInstall ?? ((projectDir) => new Installer().hasManifestAnywhere(projectDir));
    this.advisor = new AssetPermissionAdvisor(this.assetsDir);
  }

  public toDefinition(): Plugin.Plugin {
    const plugin = this;
    return Plugin.define({
      id: PLUGIN_ID,
      effect: Effect.fn(function* (context) {
        const registered = yield* plugin.registerBundledAssets(context);
        if (!registered) return;
        yield* plugin.advisoryEffect(() => plugin.adviseNotInstalledOnce(context.location.directory));
      }),
    });
  }

  private registerBundledAssets(context: Plugin.Context): Effect.Effect<boolean, never, Scope.Scope> {
    const plugin = this;
    const loaded = Effect.tryPromise({
      try: () => plugin.loadBundledContent(),
      catch: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });
    return Effect.matchEffect(loaded, {
      onFailure: (message) => Effect.as(plugin.advisoryEffect(() => plugin.adviseFailureOnce(message)), false),
      onSuccess: (content) => Effect.as(plugin.registrationEffect(context, content), true),
    });
  }

  private async loadBundledContent(): Promise<BundledContent> {
    const agents = await new AgentLoader(this.agentsDir).loadAgents();
    const skills = await new SkillLoader(this.skillsDir).loadSkills();
    const commands = await new CommandLoader(this.commandsDir).loadCommands();
    return { agents, skills, commands };
  }

  private registrationEffect(
    context: Plugin.Context,
    content: BundledContent,
  ): Effect.Effect<void, never, Scope.Scope> {
    const plugin = this;
    return Effect.gen(function* () {
      yield* context.agent.transform((editor) => {
        for (const agent of Object.values(content.agents)) plugin.injectAgent(editor, agent);
      });
      yield* context.skill.transform((editor) => {
        for (const skill of content.skills) editor.add(plugin.toSkillInfo(skill));
      });
      yield* context.command.transform((editor) => {
        for (const command of content.commands) editor.add(plugin.toCommandDefinition(context, command));
      });
      yield* context.permission.hook("evaluate", (input) => Effect.sync(() => plugin.advisor.evaluate(input)));
    });
  }

  private injectAgent(editor: AgentEditor, loaded: LoadedAgent): void {
    editor.update(loaded.name, (agent) => {
      agent.mode = loaded.mode;
      agent.description = loaded.description;
      agent.system = loaded.system;
      agent.permissions.push(...loaded.permissions);
    });
  }

  private toSkillInfo(skill: LoadedSkill): Skill.Info {
    return {
      id: Skill.ID.make(skill.id),
      name: Skill.Name.make(skill.name),
      description: skill.description,
      path: skill.path as Skill.Info["path"],
      content: skill.content,
    };
  }

  private toCommandDefinition(context: Plugin.Context, command: LoadedCommand): CommandDefinition {
    const plugin = this;
    return {
      name: command.name,
      description: command.description,
      execute: (invocation: CommandInvocation) => plugin.deliverCommand(context, command, invocation),
    };
  }

  private deliverCommand(
    context: Plugin.Context,
    command: LoadedCommand,
    invocation: CommandInvocation,
  ): Effect.Effect<void, unknown> {
    return Effect.asVoid(
      context.session.prompt({
        sessionID: invocation.sessionID,
        delivery: invocation.delivery,
        text: this.renderCommandTemplate(command, invocation.prompt.text),
        skills: [{ id: Skill.ID.make(UPGRADE_SKILL_ID) }],
      }),
    );
  }

  private renderCommandTemplate(command: LoadedCommand, args: string): string {
    const trimmed = args.trim();
    if (!command.template.includes("$ARGUMENTS")) {
      return trimmed.length === 0 ? command.template : `${command.template}\n\n${trimmed}`;
    }
    return command.template.replaceAll("$ARGUMENTS", trimmed);
  }

  private advisoryEffect(run: () => Promise<void>): Effect.Effect<void, never, never> {
    return Effect.asVoid(
      Effect.orElseSucceed(Effect.tryPromise({ try: run, catch: () => "advisory failed" }), () => undefined),
    );
  }

  private async adviseNotInstalledOnce(directory: string): Promise<void> {
    if (this.notInstalledAdvised) return;
    if (await this.hasInstall(directory)) return;
    this.notInstalledAdvised = true;
    try {
      console.log(
        `[${PACKAGE_NAME}] Not installed in any scope. Run: bunx ${PACKAGE_NAME} install --scope global ` +
          `(or: bunx ${PACKAGE_NAME} install).`,
      );
    } catch {}
  }

  private async adviseFailureOnce(message: string): Promise<void> {
    if (this.failureAdvised) return;
    this.failureAdvised = true;
    await this.emitAdvisory(message);
  }

  private async emitAdvisory(message: string): Promise<void> {
    const prefix =
      `Failed to load the bundled extension suite. Run: bunx ${PACKAGE_NAME} clear-cache, then ` +
      `reinstall and restart OpenCode. The stale cache copy is `;
    let text: string;
    try {
      text = `${prefix}${new NpmCache().root()}${path.sep}${PACKAGE_NAME}@${await this.readVersion()}. Cause: ${message}`;
    } catch {
      text = `${prefix}${new NpmCache().root()}${path.sep}${PACKAGE_NAME}@<version>. Cause: ${message}`;
    }
    try {
      console.warn(`[${PACKAGE_NAME}] ${text}`);
    } catch {}
  }

  private async readPackageMetadata(): Promise<string> {
    const manifest = JSON.parse(
      await readFile(path.join(import.meta.dirname, "..", "package.json"), "utf-8"),
    ) as { version: string };
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      throw new Error("unreadable package metadata");
    }
    return manifest.version;
  }
}

const opencodeArchitect = new OpencodeArchitectPlugin();

export default opencodeArchitect.toDefinition();
