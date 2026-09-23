import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearCache, ClearCacheUsageError, isUnsafePackageName, packagesCacheRoot, opencodeCacheRoot } from "../cache-cleaner";

let cacheDir = "";
let originalXdgCache: string | undefined;

beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "oa-clear-cache-"));
  originalXdgCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheDir;
});

afterEach(async () => {
  if (originalXdgCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = originalXdgCache;
  await rm(cacheDir, { recursive: true, force: true });
});

function cacheRoot(): string {
  return packagesCacheRoot();
}

async function seedPackage(name: string): Promise<string> {
  const dir = path.join(cacheRoot(), name);
  await mkdir(path.join(dir, "nested"), { recursive: true });
  await writeFile(path.join(dir, "nested", "file.txt"), "cached");
  return dir;
}

describe("clearCache default mode", () => {
  test("removes opencode-architect and every opencode-architect@* copy", async () => {
    const plain = await seedPackage("opencode-architect");
    const latest = await seedPackage("opencode-architect@latest");
    const versioned = await seedPackage("opencode-architect@0.7.1");
    const other = await seedPackage("other-package");

    const outcome = await clearCache();

    expect(outcome.warnings).toEqual([]);
    expect(outcome.removed.sort()).toEqual([plain, latest, versioned].sort());
    expect(existsSync(plain)).toBe(false);
    expect(existsSync(latest)).toBe(false);
    expect(existsSync(versioned)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  test("exits successfully with nothing cached", async () => {
    const outcome = await clearCache();

    expect(outcome.removed).toEqual([]);
    expect(outcome.warnings).toEqual([]);
  });

  test("succeeds when the packages directory does not exist at all", async () => {
    const outcome = await clearCache();

    expect(outcome.removed).toEqual([]);
    expect(outcome.warnings).toEqual([]);
  });
});

describe("clearCache --package mode", () => {
  test("removes only that package's cache dirs", async () => {
    const target = await seedPackage("some-pkg");
    await seedPackage("some-pkg@1.0.0");
    const ours = await seedPackage("opencode-architect");

    const outcome = await clearCache({ packageName: "some-pkg", yes: true });

    expect(outcome.warnings).toEqual([]);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(path.join(cacheRoot(), "some-pkg@1.0.0"))).toBe(false);
    expect(existsSync(ours)).toBe(true);
  });

  test("requires --yes and deletes nothing without it", async () => {
    const dir = await seedPackage("some-pkg");

    expect(() => clearCache({ packageName: "some-pkg" })).toThrow(ClearCacheUsageError);
    try {
      await clearCache({ packageName: "some-pkg" });
    } catch {
      // expected
    }
    expect(existsSync(dir)).toBe(true);
  });

  test("rejects unsafe package names", async () => {
    for (const name of ["../escape", "foo/bar", "foo\\bar", "..", "."]) {
      expect(() => clearCache({ packageName: name, yes: true })).toThrow(ClearCacheUsageError);
      expect(isUnsafePackageName(name)).toBe(true);
    }
  });
});

describe("clearCache --all mode", () => {
  test("removes the entire opencode cache directory", async () => {
    await seedPackage("opencode-architect");
    const unrelated = path.join(opencodeCacheRoot(), "other-tool");
    await mkdir(unrelated, { recursive: true });
    await writeFile(path.join(unrelated, "data"), "x");

    const outcome = await clearCache({ all: true, yes: true });

    expect(outcome.warnings).toEqual([]);
    expect(existsSync(opencodeCacheRoot())).toBe(false);
  });

  test("requires --yes and deletes nothing without it", async () => {
    await seedPackage("opencode-architect");

    try {
      await clearCache({ all: true });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ClearCacheUsageError);
    }
    expect(existsSync(path.join(cacheRoot(), "opencode-architect"))).toBe(true);
  });
});

describe("clearCache argument validation", () => {
  test("--package together with --all exits with a usage error", async () => {
    try {
      await clearCache({ packageName: "some-pkg", all: true, yes: true });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ClearCacheUsageError);
      expect((error as Error).message).toContain("mutually exclusive");
    }
  });
});

describe("clearCache failure tolerance", () => {
  test("warns and continues when a removal fails", async () => {
    const kept = await seedPackage("opencode-architect");
    const removed = await seedPackage("opencode-architect@0.1.0");
    await chmod(kept, 0o500);

    try {
      const outcome = await clearCache();

      expect(outcome.removed).toContain(removed);
      expect(existsSync(removed)).toBe(false);
      expect(outcome.warnings.length).toBe(1);
      expect(outcome.warnings[0]).toContain(kept);
    } finally {
      await chmod(kept, 0o700);
    }
  });
});
