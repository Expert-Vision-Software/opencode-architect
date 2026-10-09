import { exists, lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EntrySpec } from "./entry-spec";

const MEMO_LIMIT = 100;

const resolvedRootMemo = new Map<string, string | null>();

export class PluginEntryResolver {
  public static async resolvesToPackage(entry: unknown, packageName: string): Promise<boolean> {
    const classified = EntrySpec.classify(entry);
    if (classified === null || classified.form === "npm") return false;
    const root = await PluginEntryResolver.resolveToPackageRoot(classified.spec);
    if (root === null) return false;
    const name = await PluginEntryResolver.packageNameAt(root);
    if (name === null) return false;
    return PluginEntryResolver.matchesName(name, packageName);
  }

  public static async packageRoot(entry: unknown): Promise<string | null> {
    const spec = EntrySpec.specOf(entry);
    if (spec === null) return null;
    return PluginEntryResolver.resolveToPackageRoot(spec);
  }

  private static matchesName(candidate: string, packageName: string): boolean {
    return EntrySpec.baseName(candidate) === EntrySpec.baseName(packageName);
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
