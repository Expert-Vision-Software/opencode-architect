import { exists, lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const MEMO_LIMIT = 100;

const resolvedRootMemo = new Map<string, string | null>();

export class PluginEntryResolver {
  public static async resolvesToPackage(entry: unknown, packageName: string): Promise<boolean> {
    if (typeof entry === "string") {
      if (PluginEntryResolver.isNpmSpec(entry)) return false;
      if (!PluginEntryResolver.isPathLike(entry)) return false;
      const root = await PluginEntryResolver.resolveToPackageRoot(entry);
      if (root === null) return false;
      const name = await PluginEntryResolver.packageNameAt(root);
      if (name === null) return false;
      return PluginEntryResolver.matchesName(name, packageName);
    }
    if (PluginEntryResolver.isRecord(entry)) {
      const spec = entry.package;
      if (typeof spec === "string") return PluginEntryResolver.resolvesToPackage(spec, packageName);
    }
    return false;
  }

  private static isPathLike(entry: string): boolean {
    if (entry.startsWith("file://")) return true;
    if (entry.startsWith(".")) return true;
    if (isAbsolute(entry)) return true;
    if (entry.includes("/")) return true;
    if (entry.includes("\\")) return true;
    return false;
  }

  private static isNpmSpec(entry: string): boolean {
    if (!entry.includes("@")) return false;
    if (entry.startsWith("file://")) return false;
    if (entry.startsWith(".")) return false;
    if (isAbsolute(entry)) return false;
    return true;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static matchesName(candidate: string, packageName: string): boolean {
    return PluginEntryResolver.baseName(candidate) === PluginEntryResolver.baseName(packageName);
  }

  private static baseName(raw: string): string {
    const trimmed = raw.trim();
    const specIndex = trimmed.lastIndexOf("@");
    if (specIndex > 0) return trimmed.slice(0, specIndex);
    return trimmed;
  }

  private static async resolveToPackageRoot(rawEntry: string): Promise<string | null> {
    const cached = resolvedRootMemo.get(rawEntry);
    if (cached !== undefined) return cached;
    if (resolvedRootMemo.size >= MEMO_LIMIT) resolvedRootMemo.clear();

    let targetPath: string;
    try {
      targetPath = rawEntry.startsWith("file://") ? fileURLToPath(rawEntry) : rawEntry;
    } catch {
      resolvedRootMemo.set(rawEntry, null);
      return null;
    }

    try {
      targetPath = await realpath(targetPath);
    } catch {}

    let stats;
    try {
      stats = await lstat(targetPath);
    } catch {
      resolvedRootMemo.set(rawEntry, null);
      return null;
    }
    if (!stats.isFile() && !stats.isDirectory()) {
      resolvedRootMemo.set(rawEntry, null);
      return null;
    }

    const start = stats.isFile() ? dirname(targetPath) : targetPath;
    const found = await PluginEntryResolver.walkToPackageRoot(start);
    resolvedRootMemo.set(rawEntry, found);
    return found;
  }

  private static async walkToPackageRoot(start: string): Promise<string | null> {
    let current = start;
    let previous = "";
    while (current !== previous) {
      const name = await PluginEntryResolver.packageNameAt(current);
      if (name !== null) return current;
      previous = current;
      current = dirname(current);
    }
    return null;
  }

  private static async packageNameAt(root: string): Promise<string | null> {
    const candidate = join(root, "package.json");
    if (!(await exists(candidate))) return null;
    try {
      const parsed = JSON.parse(await readFile(candidate, "utf-8")) as { name?: unknown };
      return typeof parsed.name === "string" ? parsed.name : null;
    } catch {
      return null;
    }
  }
}
