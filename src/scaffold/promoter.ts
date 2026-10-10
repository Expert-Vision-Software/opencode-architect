import { exists, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PluginConfigEditor } from "../core/plugin-config";
import { sha256 } from "../core/manifest";
import { ScaffoldRenderer, architectPackageRoot, fileDependency, type ShipKind } from "./renderer";
import { Scaffolder } from "./scaffolder";

const CONTENT_MAPPINGS: Array<{ source: string; destination: string; kind: ShipKind }> = [
  { source: "skills", destination: "skills", kind: "skills" },
  { source: "commands", destination: "commands", kind: "commands" },
  { source: "agents", destination: "agents", kind: "agents" },
  { source: "plugin", destination: "plugins", kind: "plugins" },
  { source: "tools", destination: "tools", kind: "tools" },
];

const SOURCE_ARTIFACTS = ["package.json", "package-lock.json", "bun.lock", "bun.lockb", "node_modules"];

export interface RemovalCandidate {
  sourcePath: string;
  relativePath: string;
}

export interface PromoteOptions {
  projectDir: string;
  name: string | null;
  target: string | null;
  yes: boolean;
}

export type PromoteOutcome =
  | {
      ok: true;
      packageName: string;
      packageDir: string;
      configPath: string | null;
      retired: boolean;
      removed: string[];
      managed: string[];
      wouldRemove: string[];
      notes: string[];
    }
  | { ok: false; error: string; retired: boolean };

interface InventoryEntry {
  kind: ShipKind;
  sourcePath: string;
  relativePath: string;
  content: string;
}

export class Promoter {
  public async promote(options: PromoteOptions): Promise<PromoteOutcome> {
    const sourceDir = path.join(options.projectDir, ".opencode");
    if (!(await exists(sourceDir))) {
      return { ok: false, error: `No .opencode/ directory found at ${options.projectDir}.`, retired: false };
    }
    const repoRootResult = await this.repoRoot(options.projectDir);
    const repoRoot = repoRootResult.root;
    const name = options.name ?? this.deriveName(repoRoot);
    if (!/^opencode-[a-z0-9][a-z0-9-._]*$/.test(name)) {
      return { ok: false, error: `Invalid package name: ${name}. Pass --name opencode-<name>.`, retired: false };
    }
    const target = options.target ?? "here";
    if (target !== "here" && target !== "sibling") {
      return { ok: false, error: `Invalid target: ${target}. Must be "here" or "sibling".`, retired: false };
    }
    const packageDir =
      target === "sibling" ? path.join(path.dirname(repoRoot), name) : path.join(repoRoot, name);
    if (target === "sibling" && (await exists(packageDir)) && (await this.isExistingPackage(packageDir))) {
      return {
        ok: false,
        error:
          `An existing package sits at the sibling target ${packageDir}. ` +
          `Merging into an existing package requires per-item consent and is not automated; ` +
          `route the merge decisions through the packager / plugin-engineer flow, or choose another --name.`,
        retired: false,
      };
    }
    if (await exists(packageDir)) {
      return { ok: false, error: `Target directory already exists: ${packageDir}. Remove it or choose another name.`, retired: false };
    }

    const inventory = await this.inventory(sourceDir);
    if (inventory.length === 0) {
      return { ok: false, error: `No skills, commands, agents, plugins, or tools found in ${sourceDir}.`, retired: false };
    }
    const ship = [...new Set(inventory.map((entry) => entry.kind))];

    const architectRoot = architectPackageRoot();
    const rendered = new ScaffoldRenderer().render({ name, ship, coreDependency: fileDependency(packageDir, architectRoot) });
    await new Scaffolder().writeRendered(packageDir, rendered);
    await this.linkCoreDependency(packageDir, architectRoot);
    for (const entry of inventory) {
      const targetPath = path.join(packageDir, entry.relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, entry.content);
    }

    const editor = new PluginConfigEditor();
    const reference = await editor.ensurePluginEntry(
      name,
      { scope: "local", projectDir: options.projectDir },
      pathToFileURL(packageDir).href,
    );
    if (reference.action === "blocked") {
      return {
        ok: false,
        error:
          `The config reference could not be established: ${reference.warning ?? "every candidate was unwritable"} ` +
          `Retirement aborted; the source .opencode/ content is left in place.`,
        retired: false,
      };
    }

    const install = Bun.spawn([process.execPath, path.join(packageDir, "src", "cli.ts"), "install"], {
      cwd: options.projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const installExit = await install.exited;
    if (installExit !== 0) {
      const detail = await new Response(install.stderr).text();
      return {
        ok: false,
        error: `The package's install failed (exit ${installExit}); retirement aborted. ${detail.trim()}`,
        retired: false,
      };
    }
    const verifyError = await this.verifyPayload(options.projectDir, name);
    if (verifyError !== null) {
      return { ok: false, error: `${verifyError} Retirement aborted.`, retired: false };
    }

    const manifest = await this.readManifest(options.projectDir, name);
    if (manifest === null) {
      return { ok: false, error: `The install manifest is missing; the payload could not be verified. Retirement aborted.`, retired: false };
    }
    const removal = await this.removalPlan(sourceDir, packageDir, inventory, manifest.mode);
    if (!options.yes) {
      return {
        ok: true,
        packageName: name,
        packageDir,
        configPath: reference.configPath,
        retired: false,
        removed: [],
        managed: removal.managed,
        wouldRemove: [...removal.removable, ...removal.artifacts],
        notes: repoRootResult.notes,
      };
    }
    const removed: string[] = [];
    for (const relativePath of removal.removable) {
      await rm(path.join(sourceDir, relativePath), { force: true });
      removed.push(relativePath);
    }
    for (const artifact of removal.artifacts) {
      await rm(path.join(sourceDir, artifact), { recursive: true, force: true });
      removed.push(artifact);
    }
    await this.pruneEmptyDirs(sourceDir);
    return {
      ok: true,
      packageName: name,
      packageDir,
      configPath: reference.configPath,
      retired: true,
      removed,
      managed: removal.managed,
      wouldRemove: [],
      notes: repoRootResult.notes,
    };
  }

  /**
   * Links the core dependency the way a package manager links a `file:`
   * dependency (ADR-0013) — a junction into the installed architect package,
   * so the promoted package's install can resolve `opencode-architect/core`
   * locally, with no registry access.
   */
  private async linkCoreDependency(packageDir: string, architectRoot: string): Promise<void> {
    const linkPath = path.join(packageDir, "node_modules", "opencode-architect");
    if (await exists(linkPath)) return;
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(architectRoot, linkPath, process.platform === "win32" ? "junction" : "dir");
  }

  private async repoRoot(projectDir: string): Promise<{ root: string; notes: string[] }> {
    const git = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(git.stdout).text(), git.exited]);
    if (exitCode !== 0) {
      return { root: projectDir, notes: [`git rev-parse failed; assuming ${projectDir} as the repo root.`] };
    }
    const root = stdout.trim();
    if (root.length === 0 || path.basename(root) === ".opencode") {
      return { root: projectDir, notes: [`git rev-parse gave no usable root; assuming ${projectDir} as the repo root.`] };
    }
    return { root, notes: [] };
  }

  private async isExistingPackage(dir: string): Promise<boolean> {
    return (await exists(path.join(dir, "package.json"))) || (await exists(path.join(dir, "plugin.ts")));
  }

  private deriveName(repoRoot: string): string {
    const base = path.basename(repoRoot)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base.startsWith("opencode-") ? base : `opencode-${base}`;
  }

  private async inventory(sourceDir: string): Promise<InventoryEntry[]> {
    const entries: InventoryEntry[] = [];
    for (const mapping of CONTENT_MAPPINGS) {
      const dir = path.join(sourceDir, mapping.source);
      if (!(await exists(dir))) continue;
      for (const filePath of await this.listFiles(dir)) {
        const relativePath = `${mapping.destination}/${path.relative(dir, filePath).replaceAll("\\", "/")}`;
        entries.push({
          kind: mapping.kind,
          sourcePath: filePath,
          relativePath,
          content: await readFile(filePath, "utf-8"),
        });
      }
    }
    return entries;
  }

  private async listFiles(dir: string): Promise<string[]> {
    const found: string[] = [];
    for (const dirent of await readdir(dir, { withFileTypes: true })) {
      const child = path.join(dir, dirent.name);
      if (dirent.isDirectory()) found.push(...(await this.listFiles(child)));
      else if (dirent.isFile()) found.push(child);
    }
    return found;
  }

  public async verifyPayload(projectDir: string, name: string): Promise<string | null> {
    const manifestPath = path.join(projectDir, ".opencode", `${name}.manifest.json`);
    if (!(await exists(manifestPath))) {
      return `The install manifest is missing at ${manifestPath}; the payload could not be verified.`;
    }
    let manifest: { version?: unknown; mode?: unknown; files?: Record<string, string> };
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    } catch {
      return `The install manifest at ${manifestPath} does not parse.`;
    }
    if (typeof manifest.version !== "string" || typeof manifest.mode !== "string") {
      return `The install manifest at ${manifestPath} is missing version or mode.`;
    }
    for (const [relativePath, hash] of Object.entries(manifest.files ?? {})) {
      const absolute = path.join(projectDir, ".opencode", relativePath);
      if (!(await exists(absolute))) {
        return `Manifest lists ${relativePath} but it is missing on disk.`;
      }
      const actual = await sha256(absolute);
      if (actual !== hash) {
        return `Manifest hash mismatch for ${relativePath}: the on-disk content does not match the installed payload.`;
      }
    }
    const configPath = await new PluginConfigEditor().findRegistration(name, {
      scope: "local",
      projectDir,
    });
    if (configPath === null) return `No config reference for ${name} could be found.`;
    return null;
  }

  public async removalPlan(
    sourceDir: string,
    packageDir: string,
    inventory: RemovalCandidate[],
    mode: string,
  ): Promise<{ removable: string[]; managed: string[]; artifacts: string[] }> {
    const removable: string[] = [];
    const managed: string[] = [];
    for (const entry of inventory) {
      const packageCopy = path.join(packageDir, entry.relativePath);
      const original = entry.sourcePath;
      const identical = await this.filesIdentical(original, packageCopy);
      const managedByInstall = mode === "copy" && identical;
      if (managedByInstall) managed.push(path.relative(sourceDir, original).replaceAll("\\", "/"));
      else removable.push(path.relative(sourceDir, original).replaceAll("\\", "/"));
    }
    const artifacts: string[] = [];
    for (const artifact of SOURCE_ARTIFACTS) {
      if (await exists(path.join(sourceDir, artifact))) artifacts.push(artifact);
    }
    return { removable, managed, artifacts };
  }

  private async filesIdentical(left: string, right: string): Promise<boolean> {
    try {
      return (await readFile(left, "utf-8")) === (await readFile(right, "utf-8"));
    } catch {
      return false;
    }
  }

  private async readManifest(projectDir: string, name: string): Promise<{ mode: string } | null> {
    try {
      const parsed = JSON.parse(await readFile(path.join(projectDir, ".opencode", `${name}.manifest.json`), "utf-8"));
      return typeof parsed.mode === "string" ? { mode: parsed.mode } : null;
    } catch {
      return null;
    }
  }

  private async pruneEmptyDirs(sourceDir: string): Promise<void> {
    for (const mapping of CONTENT_MAPPINGS) {
      const dir = path.join(sourceDir, mapping.source);
      if (!(await exists(dir))) continue;
      const info = await stat(dir);
      if (!info.isDirectory()) continue;
      if ((await this.listFiles(dir)).length > 0) continue;
      await rm(dir, { recursive: true, force: true });
    }
  }
}
