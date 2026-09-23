import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const PACKAGE_NAME = "opencode-architect";

export interface ClearCacheOptions {
  packageName?: string;
  all?: boolean;
  yes?: boolean;
}

export interface ClearCacheOutcome {
  removed: string[];
  warnings: string[];
}

export class ClearCacheUsageError extends Error {}

export function packagesCacheRoot(): string {
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  if (xdgCacheHome) return path.join(xdgCacheHome, "opencode", "packages");
  return path.join(homedir(), ".cache", "opencode", "packages");
}

export function opencodeCacheRoot(): string {
  return path.dirname(packagesCacheRoot());
}

export function isUnsafePackageName(name: string): boolean {
  return name.includes("/") || name.includes("\\") || name === ".." || name === ".";
}

export async function clearCache(options: ClearCacheOptions = {}): Promise<ClearCacheOutcome> {
  const { packageName, all = false, yes = false } = options;

  if (packageName !== undefined && all) {
    throw new ClearCacheUsageError("--package and --all are mutually exclusive.");
  }
  if (packageName !== undefined && !yes) {
    throw new ClearCacheUsageError(`--package requires --yes to confirm deletion. Re-run with: clear-cache --package ${packageName} --yes`);
  }
  if (all && !yes) {
    throw new ClearCacheUsageError("--all requires --yes to confirm deletion. Re-run with: clear-cache --all --yes");
  }
  if (packageName !== undefined && isUnsafePackageName(packageName)) {
    throw new ClearCacheUsageError(`Invalid package name: ${packageName}. Package names must not contain path separators or "..".`);
  }

  const removed: string[] = [];
  const warnings: string[] = [];

  if (all) {
    const target = opencodeCacheRoot();
    try {
      await rm(target, { recursive: true, force: true });
      removed.push(target);
    } catch (error) {
      warnings.push(`Could not remove ${target}: ${errorMessage(error)}`);
    }
    return { removed, warnings };
  }

  const name = packageName ?? PACKAGE_NAME;
  const packagesRoot = packagesCacheRoot();
  let entries: string[];
  try {
    entries = await readdir(packagesRoot);
  } catch (error) {
    if (isMissingError(error)) return { removed, warnings };
    throw error;
  }

  const prefix = `${name}@`;
  const targets = entries
    .filter((entry) => entry === name || entry.startsWith(prefix))
    .sort()
    .map((entry) => path.join(packagesRoot, entry));

  for (const target of targets) {
    try {
      await rm(target, { recursive: true });
      removed.push(target);
    } catch (error) {
      warnings.push(`Could not clear cached package ${target}: ${errorMessage(error)}`);
    }
  }
  return { removed, warnings };
}

function isMissingError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
