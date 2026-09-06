import { createHash } from "node:crypto";
import { copyFile, exists, mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { AGENT_FILENAMES, RELATIVE_REFERENCE_REGEX } from "./agent-loader";

export type Scope = "local" | "global";
export type InstallMode = "none" | "copy" | "plugin";
export type InstallAction = "installed" | "upgraded" | "noop";

export interface ManifestHashEntry {
  path: string;
  hash: string;
}

export interface Manifest {
  version: string;
  agentFiles: string[];
  referencesDir: string;
  hashes: ManifestHashEntry[];
}

export interface InstallOptions {
  force: boolean;
  projectDir: string;
}

export interface InstallOutcome {
  action: InstallAction;
  scope: Scope;
  agentsDir: string;
  referencesDir: string;
  manifestPath: string;
  copied: string[];
  skipped: string[];
  overwritten: string[];
  pluginRemoved: boolean;
}

export interface UninstallOutcome {
  scope: Scope;
  mode: InstallMode;
  removed: string[];
  pluginRemoved: boolean;
}

export interface StatusOutcome {
  scope: Scope;
  mode: InstallMode;
  version: string | null;
}

const PACKAGE_NAME = "opencode-architect";
const MANIFEST_NAME = "opencode-architect.json";
const ASSETS_AGENTS_DIR = path.join(import.meta.dirname, "assets", "agents");
const ASSETS_REFERENCES_DIR = path.join(import.meta.dirname, "assets", "references");

export class Installer {
  public async install(scope: Scope, options: InstallOptions): Promise<InstallOutcome> {
    const base = this.scopeBase(scope, options.projectDir);
    const configPath = path.join(base, "opencode.json");
    const manifestPath = path.join(base, MANIFEST_NAME);
    const agentsDir = path.join(base, "agents");
    const referencesDir = path.join(base, "opencode-architect", "references");
    const version = await getPackageVersion();

    let pluginRemoved = false;
    if (await this.hasPluginEntry(configPath)) {
      if (!options.force) {
        throw new Error(
          `The "${PACKAGE_NAME}" plugin entry in ${configPath} must be removed before a copy install ` +
            `(copied agents would silently shadow the plugin's agents). Re-run with --force to remove ` +
            `the entry and switch this scope to copy install.`,
        );
      }
      await this.removePluginEntry(configPath);
      pluginRemoved = true;
    }

    const existingManifest = await this.readManifest(manifestPath);
    if (existingManifest !== null && existingManifest.version === version) {
      return {
        action: "noop",
        scope,
        agentsDir,
        referencesDir,
        manifestPath,
        copied: [],
        skipped: [],
        overwritten: [],
        pluginRemoved,
      };
    }

    const action: InstallAction = existingManifest === null ? "installed" : "upgraded";
    const copied: string[] = [];
    const skipped: string[] = [];
    const overwritten: string[] = [];
    const hashes: ManifestHashEntry[] = [];

    await mkdir(agentsDir, { recursive: true });
    await mkdir(referencesDir, { recursive: true });

    for (const filename of AGENT_FILENAMES) {
      const relativePath = path.join("agents", filename);
      const disposition = await this.disposition(existingManifest, base, relativePath, options.force);
      if (disposition === "skip") {
        skipped.push(relativePath);
        hashes.push({ path: relativePath, hash: await sha256File(path.join(base, relativePath)) });
        continue;
      }
      const source = await readFile(path.join(ASSETS_AGENTS_DIR, filename), "utf-8");
      await writeFile(path.join(base, relativePath), this.rewriteReferencePaths(source, referencesDir));
      hashes.push({ path: relativePath, hash: await sha256File(path.join(base, relativePath)) });
      if (disposition === "overwrite") overwritten.push(relativePath);
      else copied.push(relativePath);
    }

    for (const entry of await readdir(ASSETS_REFERENCES_DIR)) {
      const relativePath = path.join("opencode-architect", "references", entry);
      const disposition = await this.disposition(existingManifest, base, relativePath, options.force);
      if (disposition === "skip") {
        skipped.push(relativePath);
        hashes.push({ path: relativePath, hash: await sha256File(path.join(base, relativePath)) });
        continue;
      }
      await copyFile(path.join(ASSETS_REFERENCES_DIR, entry), path.join(base, relativePath));
      hashes.push({ path: relativePath, hash: await sha256File(path.join(base, relativePath)) });
      if (disposition === "overwrite") overwritten.push(relativePath);
      else copied.push(relativePath);
    }

    const manifest: Manifest = { version, agentFiles: [...AGENT_FILENAMES], referencesDir, hashes };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    return { action, scope, agentsDir, referencesDir, manifestPath, copied, skipped, overwritten, pluginRemoved };
  }

  public async uninstall(scope: Scope, projectDir: string): Promise<UninstallOutcome> {
    const base = this.scopeBase(scope, projectDir);
    const configPath = path.join(base, "opencode.json");
    const manifestPath = path.join(base, MANIFEST_NAME);
    const manifest = await this.readManifest(manifestPath);
    const hadPluginEntry = await this.hasPluginEntry(configPath);
    const removed: string[] = [];

    if (manifest !== null) {
      for (const entry of manifest.hashes) {
        const target = path.join(base, entry.path);
        if (await exists(target)) {
          await rm(target);
          removed.push(target);
        }
      }
      await rm(manifestPath);
      removed.push(manifestPath);
      await this.removeIfEmpty(path.join(base, "opencode-architect", "references"));
      await this.removeIfEmpty(path.join(base, "opencode-architect"));
      await this.removeIfEmpty(path.join(base, "agents"));
    }

    let pluginRemoved = false;
    if (hadPluginEntry) {
      await this.removePluginEntry(configPath);
      pluginRemoved = true;
    }

    const mode: InstallMode = manifest !== null ? "copy" : hadPluginEntry ? "plugin" : "none";
    return { scope, mode, removed, pluginRemoved };
  }

  public async status(scope: Scope, projectDir: string): Promise<StatusOutcome> {
    const base = this.scopeBase(scope, projectDir);
    const manifest = await this.readManifest(path.join(base, MANIFEST_NAME));

    if (manifest !== null) {
      return { scope, mode: "copy", version: manifest.version };
    }
    if (await this.hasPluginEntry(path.join(base, "opencode.json"))) {
      return { scope, mode: "plugin", version: null };
    }
    return { scope, mode: "none", version: null };
  }

  private async disposition(
    manifest: Manifest | null,
    base: string,
    relativePath: string,
    force: boolean,
  ): Promise<"copy" | "overwrite" | "skip"> {
    if (manifest === null) return "copy";
    const priorHash = manifest.hashes.find((entry) => entry.path === relativePath)?.hash ?? null;
    if (priorHash === null) return "copy";
    const installedPath = path.join(base, relativePath);
    if (!(await exists(installedPath))) return "copy";
    if ((await sha256File(installedPath)) === priorHash) return "copy";
    return force ? "overwrite" : "skip";
  }

  private rewriteReferencePaths(content: string, referencesDir: string): string {
    return content.replace(
      RELATIVE_REFERENCE_REGEX,
      (token: string, relativePath: string): string => {
        const normalized = relativePath.replaceAll("\\", "/");
        const packagedPath = path.resolve(ASSETS_AGENTS_DIR, normalized);
        const withinReferences = path.relative(ASSETS_REFERENCES_DIR, packagedPath);
        if (withinReferences.startsWith("..")) return token;
        const installedPath = path.resolve(referencesDir, withinReferences).replaceAll("\\", "/");
        return `\`${installedPath}\``;
      },
    );
  }

  private scopeBase(scope: Scope, projectDir: string): string {
    if (scope === "local") return path.join(projectDir, ".opencode");
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) return path.join(xdgConfigHome, "opencode");
    return path.join(homedir(), ".config", "opencode");
  }

  private async readManifest(manifestPath: string): Promise<Manifest | null> {
    try {
      return JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest;
    } catch {
      return null;
    }
  }

  private async hasPluginEntry(configPath: string): Promise<boolean> {
    const plugins = await this.readPluginArray(configPath);
    return plugins.includes(PACKAGE_NAME);
  }

  private async removePluginEntry(configPath: string): Promise<void> {
    const plugins = await this.readPluginArray(configPath);
    const remaining = plugins.filter((name) => name !== PACKAGE_NAME);
    const config = await this.readConfig(configPath);
    if (remaining.length === 0) delete config.plugin;
    else config.plugin = remaining;
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  }

  private async readPluginArray(configPath: string): Promise<string[]> {
    const config = await this.readConfig(configPath);
    const plugins = config.plugin;
    return Array.isArray(plugins) ? plugins.filter((name): name is string => typeof name === "string") : [];
  }

  private async readConfig(configPath: string): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async removeIfEmpty(directory: string): Promise<void> {
    if (!(await exists(directory))) return;
    const contents = await readdir(directory);
    if (contents.length === 0) await rmdir(directory);
  }
}

async function getPackageVersion(): Promise<string> {
  const content = await readFile(path.join(import.meta.dirname, "package.json"), "utf-8");
  return (JSON.parse(content) as { version: string }).version;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}
