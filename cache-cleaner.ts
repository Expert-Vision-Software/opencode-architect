import { exists, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ClearCacheUsageError } from "./clear-cache-usage-error";

export const PACKAGE_NAME = "opencode-architect";

export interface ClearCacheOptions {
  packageName: string | null;
  all: boolean;
  yes: boolean;
  dryRun: boolean;
}

export interface ClearCacheOutcome {
  removed: string[];
  warnings: string[];
  dryRun: boolean;
}

export class CacheCleaner {
  public packagesCacheRoot(): string {
    const xdgCacheHome = process.env.XDG_CACHE_HOME;
    if (xdgCacheHome) return path.join(xdgCacheHome, "opencode", "packages");
    return path.join(homedir(), ".cache", "opencode", "packages");
  }

  public opencodeCacheRoot(): string {
    return path.dirname(this.packagesCacheRoot());
  }

  public isUnsafePackageName(name: string): boolean {
    return name.includes("/") || name.includes("\\") || name.includes("..") || name === ".";
  }

  public async clear(options: ClearCacheOptions): Promise<ClearCacheOutcome> {
    const { packageName = null, all = false, yes = false, dryRun = false } = options;
    const dryRunOutcome = (removed: string[], warnings: string[]): ClearCacheOutcome => ({ removed, warnings, dryRun });

    if (packageName !== null && all) {
      throw new ClearCacheUsageError("--package and --all are mutually exclusive.");
    }
    if (packageName !== null && !yes && !dryRun) {
      throw new ClearCacheUsageError(`--package requires --yes to confirm deletion. Re-run with: clear-cache --package ${packageName} --yes`);
    }
    if (all && !yes && !dryRun) {
      throw new ClearCacheUsageError("--all requires --yes to confirm deletion. Re-run with: clear-cache --all --yes");
    }
    if (packageName !== null && this.isUnsafePackageName(packageName)) {
      throw new ClearCacheUsageError(`Invalid package name: ${packageName}. Package names must not contain path separators or "..".`);
    }

    const removed: string[] = [];
    const warnings: string[] = [];

    if (all) {
      const target = this.opencodeCacheRoot();
      if (dryRun) {
        if (await exists(target)) removed.push(target);
        return dryRunOutcome(removed, warnings);
      }
      await this.removeTarget(target, removed, warnings, true);
      return { removed, warnings, dryRun };
    }

    const name = packageName ?? PACKAGE_NAME;
    const packagesRoot = this.packagesCacheRoot();
    let entries: string[];
    try {
      entries = await readdir(packagesRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { removed, warnings, dryRun };
      throw error;
    }

    const prefix = `${name}@`;
    const targets = entries
      .filter((entry) => entry === name || entry.startsWith(prefix))
      .sort()
      .map((entry) => path.join(packagesRoot, entry));

    if (dryRun) {
      removed.push(...targets);
      return dryRunOutcome(removed, warnings);
    }

    for (const target of targets) {
      await this.removeTarget(target, removed, warnings, false);
    }
    return { removed, warnings, dryRun };
  }

  private async removeTarget(target: string, removed: string[], warnings: string[], force: boolean): Promise<void> {
    try {
      await rm(target, { recursive: true, force });
      removed.push(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not remove ${target}: ${message}`);
    }
  }
}
