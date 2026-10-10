import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export interface CacheOutcome {
  removed: string[];
  warnings: string[];
}

/**
 * Best-effort removal of cache targets under one package-cache root,
 * warn-and-continue per target (ADR-0007 hygiene): a failing removal is a
 * warning, never a throw, and never touches anything outside the root.
 */
export async function removeCacheTargets(
  packagesRoot: string,
  wanted: (name: string) => boolean,
  rmFn: typeof rm = rm,
): Promise<CacheOutcome> {
  const removed: string[] = [];
  const warnings: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(packagesRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { removed, warnings };
    throw error;
  }
  const targets = entries
    .filter(wanted)
    .sort()
    .map((name) => join(packagesRoot, name));
  for (const target of targets) {
    try {
      await rmFn(target, { recursive: true });
      removed.push(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not clear cached package ${target}: ${message}`);
    }
  }
  return { removed, warnings };
}
