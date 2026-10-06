import { readFile } from "node:fs/promises";
import path from "node:path";
import { Effect, type Scope } from "effect";
import { Plugin } from "@opencode/plugin/effect";
import type { AgentEditor } from "@opencode/plugin/effect/agent";
import { AgentLoader, type LoadedAgent } from "./agent-loader";
import { AssetPermissionAdvisor } from "./asset-permission-advisor";
import { Installer } from "./installer";

const PACKAGE_NAME = "opencode-architect";
const PLUGIN_ID = "opencode-architect";

export class OpencodeArchitectPlugin {
  private readonly agentsDir: string;
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
    this.agentsDir = agentsDir ?? path.join(import.meta.dirname, "..", "agents");
    this.assetsDir = assetsDir ?? path.join(import.meta.dirname, "..");
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
      try: () => new AgentLoader(plugin.agentsDir).loadAgents(),
      catch: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });
    return Effect.matchEffect(loaded, {
      onFailure: (message) => Effect.as(plugin.advisoryEffect(() => plugin.adviseFailureOnce(message)), false),
      onSuccess: (agents) => Effect.as(plugin.registrationEffect(context, agents), true),
    });
  }

  private registrationEffect(
    context: Plugin.Context,
    agents: Record<string, LoadedAgent>,
  ): Effect.Effect<void, never, Scope.Scope> {
    const plugin = this;
    return Effect.flatMap(
      context.agent.transform((editor) => {
        for (const agent of Object.values(agents)) plugin.injectAgent(editor, agent);
      }),
      () =>
        context.permission.hook("evaluate", (input) =>
          Effect.sync(() => plugin.advisor.evaluate(input)),
        ),
    );
  }

  private injectAgent(editor: AgentEditor, loaded: LoadedAgent): void {
    editor.update(loaded.name, (agent) => {
      agent.mode = loaded.mode;
      agent.description = loaded.description;
      agent.system = loaded.system;
      agent.permissions.push(...loaded.permissions);
    });
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
      `Failed to load the bundled agent suite. Run: bunx ${PACKAGE_NAME} clear-cache, then ` +
      `reinstall and restart OpenCode. The stale cache copy is `;
    let text: string;
    try {
      text = `${prefix}~/.cache/opencode/packages/${PACKAGE_NAME}@${await this.readVersion()}. Cause: ${message}`;
    } catch {
      text = `${prefix}~/.cache/opencode/packages/${PACKAGE_NAME}@<version>. Cause: ${message}`;
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
