import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CacheCleaner } from "../cache-cleaner";
import { seedCachedPackage, expectClearCacheUsageError } from "./test-helpers";

let cacheDir = "";
let originalXdgCache: string | undefined;
let cleaner = new CacheCleaner();

beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "oa-clear-cache-"));
  originalXdgCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheDir;
  cleaner = new CacheCleaner();
});

afterEach(async () => {
  if (originalXdgCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = originalXdgCache;
  await rm(cacheDir, { recursive: true, force: true });
});

function cacheRoot(): string {
  return cleaner.packagesCacheRoot();
}

describe("clearCache default mode", () => {
  test("removes opencode-architect and every opencode-architect@* copy", async () => {
    const plain = await seedCachedPackage(cacheRoot(), "opencode-architect");
    const latest = await seedCachedPackage(cacheRoot(), "opencode-architect@latest");
    const versioned = await seedCachedPackage(cacheRoot(), "opencode-architect@0.7.1");
    const other = await seedCachedPackage(cacheRoot(), "other-package");

    const outcome = await cleaner.clear({ packageName: null, all: false, yes: false });

    expect(outcome.warnings).toEqual([]);
    expect(outcome.removed.sort()).toEqual([plain, latest, versioned].sort());
    expect(existsSync(plain)).toBe(false);
    expect(existsSync(latest)).toBe(false);
    expect(existsSync(versioned)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  test("succeeds with nothing cached", async () => {
    const outcome = await cleaner.clear({ packageName: null, all: false, yes: false });

    expect(outcome.removed).toEqual([]);
    expect(outcome.warnings).toEqual([]);
  });

  test("succeeds when the packages directory does not exist at all", async () => {
    const outcome = await cleaner.clear({ packageName: null, all: false, yes: false });

    expect(outcome.removed).toEqual([]);
    expect(outcome.warnings).toEqual([]);
  });
});

describe("clearCache --package mode", () => {
  test("removes only that package's cache dirs", async () => {
    const target = await seedCachedPackage(cacheRoot(), "some-pkg");
    await seedCachedPackage(cacheRoot(), "some-pkg@1.0.0");
    const ours = await seedCachedPackage(cacheRoot(), "opencode-architect");

    const outcome = await cleaner.clear({ packageName: "some-pkg", all: false, yes: true });

    expect(outcome.warnings).toEqual([]);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(path.join(cacheRoot(), "some-pkg@1.0.0"))).toBe(false);
    expect(existsSync(ours)).toBe(true);
  });

  test("requires --yes and deletes nothing without it", async () => {
    const dir = await seedCachedPackage(cacheRoot(), "some-pkg");

    await expectClearCacheUsageError(cleaner.clear({ packageName: "some-pkg", all: false, yes: false }));
    expect(existsSync(dir)).toBe(true);
  });

  test("rejects unsafe package names", async () => {
    for (const name of ["../escape", "foo/bar", "foo\\bar", "..", "foo..bar", "."]) {
      expect(cleaner.isUnsafePackageName(name)).toBe(true);
      await expectClearCacheUsageError(cleaner.clear({ packageName: name, all: false, yes: true }));
    }
  });
});

describe("clearCache --all mode", () => {
  test("removes the entire opencode cache directory", async () => {
    await seedCachedPackage(cacheRoot(), "opencode-architect");
    const unrelated = path.join(cleaner.opencodeCacheRoot(), "other-tool");
    await seedCachedPackage(unrelated, "data");

    const outcome = await cleaner.clear({ packageName: null, all: true, yes: true });

    expect(outcome.warnings).toEqual([]);
    expect(existsSync(cleaner.opencodeCacheRoot())).toBe(false);
  });

  test("requires --yes and deletes nothing without it", async () => {
    await seedCachedPackage(cacheRoot(), "opencode-architect");

    await expectClearCacheUsageError(cleaner.clear({ packageName: null, all: true, yes: false }));
    expect(existsSync(path.join(cacheRoot(), "opencode-architect"))).toBe(true);
  });
});

describe("clearCache argument validation", () => {
  test("--package together with --all rejects with a usage error", async () => {
    await expectClearCacheUsageError(cleaner.clear({ packageName: "some-pkg", all: true, yes: true }));
  });
});

describe("clearCache failure tolerance", () => {
  test("warns and continues when a removal fails", async () => {
    const kept = await seedCachedPackage(cacheRoot(), "opencode-architect");
    const removed = await seedCachedPackage(cacheRoot(), "opencode-architect@0.1.0");
    await chmod(kept, 0o500);

    try {
      const outcome = await cleaner.clear({ packageName: null, all: false, yes: false });

      expect(outcome.removed).toContain(removed);
      expect(existsSync(removed)).toBe(false);
      expect(outcome.warnings.length).toBe(1);
      expect(outcome.warnings[0]).toContain(kept);
    } finally {
      await chmod(kept, 0o700);
    }
  });
});
