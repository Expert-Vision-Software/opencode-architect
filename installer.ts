import { exists, mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { hashElement } from "folder-hash";
import { AGENT_FILENAMES } from "./agent-loader";
import { BundledAssetsMissingError } from "./bundled-assets-missing-error";
import { CopyModeUnsupportedError } from "./copy-mode-unsupported-error";
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
  clearedCache: string[];
  cacheWarnings: string[];
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
const PLUGIN_ENTRY = "opencode-architect@latest";
const MANIFEST_NAME = "opencode-architect.manifest.json";
const LEGACY_MANIFEST_NAME = "opencode-architect.json";

export class Installer {
  private readonly editor = new PluginConfigEditor();
  private readonly assetsDir: string;

  constructor(assetsDir: string | null = null) {
    this.assetsDir = assetsDir ?? path.join(import.meta.dirname, "assets");
  }

  public async install(scope: Scope, options: InstallOptions): Promise<InstallOutcome> {
    if (options.mode === "copy") {
      throw new CopyModeUnsupportedError(PACKAGE_NAME);
    }

    const base = this.scopeBase(scope, options.projectDir);
    const manifestPath = path.join(base, MANIFEST_NAME);
    const legacyManifestPath = path.join(base, LEGACY_MANIFEST_NAME);
    const record = await this.readManifestRecord(base);
    const existing = record.manifest;
    const version = await this.getPackageVersion();
    await this.requireBundledAssets(version);

    let removedPayload: string[] = [];
    let action: InstallAction;
    if (existing !== null && existing.mode === "copy") {
      if (!options.force) {
        throw new Error(
          `A legacy copy install of ${PACKAGE_NAME} was found at ${base}. ` +
            `Migrating it to plugin registration removes the copied payload it recorded, ` +
            `including any files you edited after installing. ` +
            `Re-run with --force to consent.`,
        );
      }
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

    if (action !== "noop" || options.force || record.path === legacyManifestPath) {
      const manifest: Manifest = {
        version,
        mode: "plugin",
        entry: PLUGIN_ENTRY,
        configPath: registration.configPath,
        "content-hash": null,
        hashes: null,
      };
      await mkdir(base, { recursive: true });
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      if (await exists(legacyManifestPath)) {
        await rm(legacyManifestPath);
      }
    }

    const cache = await this.prunePackageCache(version);

    return {
      action,
      scope,
      manifestPath,
      configPath: registration.configPath,
      configAction: registration.action,
      removedPayload,
      clearedCache: cache.removed,
      cacheWarnings: cache.warnings,
    };
  }

  private async requireBundledAssets(version: string): Promise<void> {
    for (const name of ["agents", "references", "templates"]) {
      const dir = path.join(this.assetsDir, name);
      if (!(await exists(dir))) throw new BundledAssetsMissingError(dir, this.packageCacheRoot(), version);
      const contents = await readdir(dir);
      if (contents.length === 0) throw new BundledAssetsMissingError(dir, this.packageCacheRoot(), version);
    }
  }

  private async prunePackageCache(version: string): Promise<{ removed: string[]; warnings: string[] }> {
    const removed: string[] = [];
    const warnings: string[] = [];
    const targets = [
      PACKAGE_NAME,
      `${PACKAGE_NAME}@latest`,
      `${PACKAGE_NAME}@${version}`,
    ].map((name) => path.join(this.packageCacheRoot(), name));
    for (const target of targets) {
      if (!(await exists(target))) continue;
      try {
        await rm(target, { recursive: true });
        removed.push(target);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Could not clear cached package ${target}: ${message}`);
      }
    }
    return { removed, warnings };
  }

  private packageCacheRoot(): string {
    const xdgCacheHome = process.env.XDG_CACHE_HOME;
    if (xdgCacheHome) return path.join(xdgCacheHome, "opencode", "packages");
    return path.join(homedir(), ".cache", "opencode", "packages");
  }

  public async uninstall(scope: Scope, projectDir: string): Promise<UninstallOutcome> {
    const base = this.scopeBase(scope, projectDir);
    const record = await this.readManifestRecord(base);
    const manifest = record.manifest;
    const removed: string[] = [];

    const removal = await this.editor.removePluginEntry(PACKAGE_NAME, { scope, projectDir });
    if (removal.action === "blocked") {
      throw new Error(removal.warning ?? "Config cleanup was blocked.");
    }
    const pluginRemoved = removal.action === "removed";

    if (manifest !== null && manifest.mode === "copy") {
      removed.push(...(await this.removePayloadPerManifest(base, manifest.hashes ?? [])));
      removed.push(...(await this.removeManifestFiles(base)));
    }

    if (manifest !== null && manifest.mode === "plugin") {
      removed.push(...(await this.removeManifestFiles(base)));
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
    const record = await this.readManifestRecord(base);
    if (record.manifest !== null) {
      return {
        scope,
        mode: record.manifest.mode,
        version: record.manifest.version,
        configPath: record.manifest.configPath,
      };
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

  private manifestCandidates(base: string): string[] {
    return [path.join(base, MANIFEST_NAME), path.join(base, LEGACY_MANIFEST_NAME)];
  }

  private async readManifestRecord(base: string): Promise<{ manifest: Manifest | null; path: string | null }> {
    for (const candidate of this.manifestCandidates(base)) {
      const manifest = await this.readManifest(candidate);
      if (manifest !== null) return { manifest, path: candidate };
    }
    return { manifest: null, path: null };
  }

  private async removeManifestFiles(base: string): Promise<string[]> {
    const removed: string[] = [];
    for (const candidate of this.manifestCandidates(base)) {
      if (!(await exists(candidate))) continue;
      await rm(candidate);
      removed.push(candidate);
    }
    return removed;
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
