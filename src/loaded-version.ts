import { exists, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { EntrySpec, type ClassifiedEntry } from "./entry-spec";
import { NpmCache } from "./npm-cache";
import { PluginEntryResolver } from "./plugin-entry";

export interface ResolvedSource {
  version: string | null;
  name: string | null;
  source: "cache" | "checkout";
  path: string;
  modifiedMs: number | null;
}

export type EntryResolution =
  | { status: "resolved"; source: ResolvedSource }
  | { status: "missing"; attempted: string }
  | { status: "partial"; attempted: string }
  | { status: "unhandled" };

export class LoadedVersionResolver {
  constructor(private readonly cache: NpmCache = new NpmCache()) {}

  public classify(entry: unknown): ClassifiedEntry | null {
    return EntrySpec.classify(entry);
  }

  public async resolve(entry: unknown): Promise<EntryResolution> {
    const classified = this.classify(entry);
    if (classified === null) return { status: "unhandled" };
    if (classified.form === "path") return this.resolvePath(classified);
    return this.resolveNpm(classified);
  }

  private async resolvePath(classified: ClassifiedEntry): Promise<EntryResolution> {
    const root = await PluginEntryResolver.packageRoot(classified.spec);
    if (root === null) return { status: "missing", attempted: classified.spec };
    const copy = await this.readCheckout(root);
    if (copy === null) return { status: "partial", attempted: root };
    return { status: "resolved", source: copy };
  }

  private async resolveNpm(classified: ClassifiedEntry): Promise<EntryResolution> {
    if (classified.name === null || classified.version === null) return { status: "unhandled" };
    const keyDir = join(this.cache.root(), `${classified.name}@${classified.version}`);
    const copy = await this.findCacheCopy(keyDir, classified.name);
    if (copy !== null) return { status: "resolved", source: copy };
    return (await exists(keyDir)) ? { status: "partial", attempted: keyDir } : { status: "missing", attempted: keyDir };
  }

  private async findCacheCopy(keyDir: string, name: string): Promise<ResolvedSource | null> {
    const direct = await this.readCacheCopy(keyDir);
    if (direct !== null) return direct;
    let entries;
    try {
      entries = await readdir(keyDir, { withFileTypes: true });
    } catch {
      return null;
    }
    let best: ResolvedSource | null = null;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const copy = await this.readCacheCopy(join(keyDir, entry.name, "node_modules", name));
      if (copy === null) continue;
      if (best === null || (copy.modifiedMs ?? 0) > (best.modifiedMs ?? 0)) best = copy;
    }
    return best;
  }

  private async readCacheCopy(dir: string): Promise<ResolvedSource | null> {
    return this.readCopy(dir, "cache");
  }

  private async readCheckout(dir: string): Promise<ResolvedSource | null> {
    return this.readCopy(dir, "checkout");
  }

  private async readCopy(dir: string, source: "cache" | "checkout"): Promise<ResolvedSource | null> {
    const manifestPath = join(dir, "package.json");
    if (!(await exists(manifestPath))) return null;
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf-8")) as { name?: unknown; version?: unknown };
      const version = typeof parsed.version === "string" ? parsed.version : null;
      const name = typeof parsed.name === "string" ? parsed.name : null;
      const info = await stat(dir);
      return { version, name, source, path: dir, modifiedMs: info.mtimeMs };
    } catch {
      return null;
    }
  }
}
