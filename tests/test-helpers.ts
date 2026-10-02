import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "bun:test";
import { ClearCacheUsageError } from "../clear-cache-usage-error";

export async function seedCachedPackage(dir: string, name: string): Promise<string> {
  const target = path.join(dir, name);
  await mkdir(path.join(target, "nested"), { recursive: true });
  await writeFile(path.join(target, "nested", "file.txt"), "cached");
  return target;
}

export async function expectClearCacheUsageError(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ClearCacheUsageError);
    return;
  }
  throw new Error("Expected the promise to reject with ClearCacheUsageError.");
}
