import { exists, lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PluginNameNormalizer } from "./plugin-name";

const resolvedRootMemo = new Map<string, string | null>();

const normalizer = new PluginNameNormalizer();

export class PluginEntryResolver {
  public static async resolvesToPackage(entry: unknown, packageName: string, baseDir?: string): Promise<boolean> {
    if (typeof entry === "string") {
      if (PluginEntryResolver.isNpmSpec(entry)) return false;
      if (!PluginEntryResolver.isPathLike(entry)) return false;
      const root = await PluginEntryResolver.resolveToPackageRoot(entry, baseDir);
      if (root === null) return false;
      const name = await PluginEntryResolver.packageNameAt(root);
      if (name === null) return false;
      return normalizer.matches(name, packageName);
    }
    if (PluginEntryResolver.isRecord(entry)) {
      const spec = entry.package;
      if (typeof spec === "string") return PluginEntryResolver.resolvesToPackage(spec, packageName, baseDir);
    }
    return false;
  }

  public static async packageRoot(entry: unknown, baseDir?: string): Promise<string | null> {
    if (typeof entry === "string") return PluginEntryResolver.resolveToPackageRoot(entry, baseDir);
    if (PluginEntryResolver.isRecord(entry)) {
      const spec = entry.package;
      if (typeof spec === "string") return PluginEntryResolver.resolveToPackageRoot(spec, baseDir);
    }
    return null;
  }

  private static hasExplicitPathForm(entry: string): boolean {
    if (entry.startsWith("file://")) return true;
    if (entry.startsWith(".")) return true;
    if (isAbsolute(entry)) return true;
    return false;
  }

  private static isPathLike(entry: string): boolean {
    if (PluginEntryResolver.hasExplicitPathForm(entry)) return true;
    if (entry.includes("/")) return true;
    if (entry.includes("\\")) return true;
    return false;
  }

  private static isNpmSpec(entry: string): boolean {
    return entry.includes("@") && !PluginEntryResolver.hasExplicitPathForm(entry);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static async resolveToPackageRoot(rawEntry: string, baseDir: string | undefined): Promise<string | null> {
    let targetPath: string;
    try {
      targetPath = rawEntry.startsWith("file://")
        ? fileURLToPath(rawEntry)
        : isAbsolute(rawEntry)
          ? rawEntry
          : join(baseDir ?? process.cwd(), rawEntry);
    } catch {
      return null;
    }
    const memoKey = targetPath;
    const cached = resolvedRootMemo.get(memoKey);
    if (cached !== undefined) return cached;

    try {
      targetPath = await realpath(targetPath);
    } catch {}

    let stats;
    try {
      stats = await lstat(targetPath);
    } catch {
      resolvedRootMemo.set(memoKey, null);
      return null;
    }
    if (!stats.isFile() && !stats.isDirectory()) {
      resolvedRootMemo.set(memoKey, null);
      return null;
    }

    const start = stats.isFile() ? dirname(targetPath) : targetPath;
    const found = await PluginEntryResolver.walkToPackageRoot(start);
    resolvedRootMemo.set(memoKey, found);
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
      const parsed = JSON.parse(await readFile(candidate, "utf-8")) as { name: unknown };
      return typeof parsed.name === "string" ? parsed.name : null;
    } catch {
      return null;
    }
  }
}
