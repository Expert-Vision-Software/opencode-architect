import { exists, mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { hashElement } from "folder-hash";
import { AGENT_FILENAMES } from "./agent-loader";
import { PluginConfigEditor } from "./plugin-config";

export type Scope = "local" | "global";
export type InstallMode = "none" | "copy" | "plugin";
export type ManifestMode = "copy" | "plugin";
export type InstallAction = "installed" | "upgraded" | "noop" | "migrated";

export interface ManifestHashEntry {
  path: string;
  hash: string;
}

export interface Manifest {
  version: string;
  mode: ManifestMode;
  entry: string | null;
  configPath: string | null;
  "content-hash": string | null;
  hashes: ManifestHashEntry[] | null;
}

export interface InstallOptions {
  force: boolean;
  mode: "plugin" | "copy";
  projectDir: string;
}

export interface InstallOutcome {
  action: InstallAction;
  scope: Scope;
  manifestPath: string;
  configPath: string | null;
  configAction: "noop" | "updated" | "created" | "blocked";
  removedPayload: string[];
}

export interface UninstallOutcome {
  scope: Scope;
  mode: InstallMode;
  removed: string[];
  pluginRemoved: boolean;
  configPath: string | null;
}

export interface StatusOutcome {
  scope: Scope;
  mode: InstallMode;
  version: string | null;
  configPath: string | null;
}

const PACKAGE_NAME = "opencode-architect";
const MANIFEST_NAME = "opencode-architect.json";

export class Installer {
  private readonly editor = new PluginConfigEditor();

  public async install(scope: Scope, options: InstallOptions): Promise<InstallOutcome> {
    if (options.mode === "copy") {
      throw new Error(
        `${PACKAGE_NAME} is a code-backed package: it ships agents, which only work through ` +
          `plugin registration. Copy install cannot express that. Run without --mode copy.`,
      );
    }

    const base = this.scopeBase(scope, options.projectDir);
    const manifestPath = path.join(base, MANIFEST_NAME);
    const version = await this.getPackageVersion();
    const existing = await this.readManifest(manifestPath);

    let removedPayload: string[] = [];
    let action: InstallAction;
    if (existing !== null && existing.mode === "copy") {
      const check = await this.editor.checkParseable({ scope, projectDir: options.projectDir });
      if (!check.ok) throw new Error(check.warning);
      removedPayload = await this.removePayloadPerManifest(base, existing.hashes ?? []);
      action = "migrated";
    } else {
      action = "installed";
    }

    const registration = await this.editor.ensurePluginEntry(PACKAGE_NAME, {
      scope,
      projectDir: options.projectDir,
    });
    if (registration.action === "blocked") {
      throw new Error(registration.warning ?? "Config registration was blocked.");
    }

    if (existing !== null && existing.mode === "plugin") {
      action = existing.version === version && registration.action === "noop" ? "noop" : "upgraded";
    }

    if (action !== "noop" || options.force) {
      const manifest: Manifest = {
        version,
        mode: "plugin",
        entry: PACKAGE_NAME,
        configPath: registration.configPath,
        "content-hash": null,
        hashes: null,
      };
      await mkdir(base, { recursive: true });
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    }

    return {
      action,
      scope,
      manifestPath,
      configPath: registration.configPath,
      configAction: registration.action,
      removedPayload,
    };
  }

  public async uninstall(scope: Scope, projectDir: string): Promise<UninstallOutcome> {
    const base = this.scopeBase(scope, projectDir);
    const manifestPath = path.join(base, MANIFEST_NAME);
    const manifest = await this.readManifest(manifestPath);
    const removed: string[] = [];

    const removal = await this.editor.removePluginEntry(PACKAGE_NAME, { scope, projectDir });
    if (removal.action === "blocked") {
      throw new Error(removal.warning ?? "Config cleanup was blocked.");
    }
    const pluginRemoved = removal.action === "removed";

    if (manifest !== null && manifest.mode === "copy") {
      removed.push(...(await this.removePayloadPerManifest(base, manifest.hashes ?? [])));
      await rm(manifestPath);
      removed.push(manifestPath);
    }

    if (manifest !== null && manifest.mode === "plugin") {
      await rm(manifestPath);
      removed.push(manifestPath);
    }

    if (manifest === null) {
      removed.push(...(await this.removeResidualPayload(base)));
    }

    const mode: InstallMode =
      manifest !== null ? manifest.mode : pluginRemoved ? "plugin" : "none";
    return { scope, mode, removed, pluginRemoved, configPath: removal.configPath };
  }

  private async removeResidualPayload(base: string): Promise<string[]> {
    const removed: string[] = [];
    const agentsDir = path.join(base, "agents");
    if (await exists(agentsDir)) {
      for (const filename of AGENT_FILENAMES) {
        const target = path.join(agentsDir, filename);
        if (await exists(target)) {
          await rm(target);
          removed.push(target);
        }
      }
      await this.removeIfEmpty(agentsDir);
    }
    const packageDir = path.join(base, PACKAGE_NAME);
    if (await exists(packageDir)) {
      await rm(packageDir, { recursive: true });
      removed.push(packageDir);
    }
    await this.removeIfEmpty(base);
    return removed;
  }

  public async status(scope: Scope, projectDir: string): Promise<StatusOutcome> {
    const base = this.scopeBase(scope, projectDir);
    const manifest = await this.readManifest(path.join(base, MANIFEST_NAME));
    if (manifest !== null) {
      return { scope, mode: manifest.mode, version: manifest.version, configPath: manifest.configPath };
    }
    const registrationPath = await this.editor.findRegistration(PACKAGE_NAME, { scope, projectDir });
    if (registrationPath !== null) {
      return { scope, mode: "plugin", version: null, configPath: registrationPath };
    }
    return { scope, mode: "none", version: null, configPath: null };
  }

  private async removePayloadPerManifest(
    base: string,
    hashes: ManifestHashEntry[],
  ): Promise<string[]> {
    const removed: string[] = [];
    for (const entry of hashes) {
      const target = path.join(base, entry.path);
      if (await exists(target)) {
        await rm(target);
        removed.push(target);
      }
    }
    await this.prunePayloadDirs(base);
    return removed;
  }

  private async prunePayloadDirs(base: string): Promise<void> {
    await this.removeIfEmpty(path.join(base, "opencode-architect", "templates"));
    await this.removeIfEmpty(path.join(base, "opencode-architect", "references"));
    await this.removeIfEmpty(path.join(base, "opencode-architect"));
    await this.removeIfEmpty(path.join(base, "agents"));
  }

  private async removeIfEmpty(directory: string): Promise<void> {
    if (!(await exists(directory))) return;
    const contents = await readdir(directory);
    if (contents.length === 0) await rmdir(directory);
  }

  private async readManifest(manifestPath: string): Promise<Manifest | null> {
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf-8")) as Partial<Manifest>;
      if (typeof parsed.version !== "string") return null;
      if (typeof parsed.mode !== "string") {
        if (!Array.isArray(parsed.hashes)) return null;
        return {
          version: parsed.version,
          mode: "copy",
          entry: null,
          configPath: null,
          "content-hash": null,
          hashes: parsed.hashes as ManifestHashEntry[],
        };
      }
      return {
        version: parsed.version,
        mode: parsed.mode,
        entry: parsed.entry ?? null,
        configPath: parsed.configPath ?? null,
        "content-hash": parsed["content-hash"] ?? null,
        hashes: parsed.hashes ?? null,
      };
    } catch {
      return null;
    }
  }

  private async getPackageVersion(): Promise<string> {
    const content = await readFile(path.join(import.meta.dirname, "package.json"), "utf-8");
    return (JSON.parse(content) as { version: string }).version;
  }

  private scopeBase(scope: Scope, projectDir: string): string {
    if (scope === "local") return path.join(projectDir, ".opencode");
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) return path.join(xdgConfigHome, "opencode");
    return path.join(homedir(), ".config", "opencode");
  }
}

export async function contentHash(directory: string): Promise<string> {
  const result = await hashElement(directory, { encoding: "hex" });
  return result.hash;
}
