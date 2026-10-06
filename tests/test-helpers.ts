import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, spyOn } from "bun:test";
import { ClearCacheUsageError } from "../src/clear-cache-usage-error";

export interface CapturedConsole {
  lines: string[];
  restore: () => void;
}

export function captureConsole(method: "log" | "warn"): CapturedConsole {
  const lines: string[] = [];
  const spy = spyOn(console, method).mockImplementation((message: unknown) => {
    lines.push(String(message));
  });
  return { lines, restore: () => spy.mockRestore() };
}

export async function seedCachedPackage(dir: string, name: string): Promise<string> {
  const target = path.join(dir, name);
  const pkgDir = path.join(target, "1738848000000", "node_modules", name.replace(/@.*$/, ""));
  await mkdir(pkgDir, { recursive: true });
  await writeFile(path.join(pkgDir, "index.ts"), "cached");
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
