import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EntryPredicate } from "../src/entry-predicate";

describe("EntryPredicate.classify", () => {
  test("parses string entries, { package } objects, and rejects junk", () => {
    expect(EntryPredicate.specOf({ package: " a@1 " })).toBe("a@1");
    expect(EntryPredicate.specOf(42)).toBeNull();
    expect(EntryPredicate.specOf(null)).toBeNull();
  });

  test("classifies npm and path forms with name and version", () => {
    const npm = EntryPredicate.classify("my-pkg@1.2.3");
    expect(npm).toEqual({ form: "npm", display: "my-pkg@1.2.3", spec: "my-pkg@1.2.3", name: "my-pkg", version: "1.2.3" });
    const scoped = EntryPredicate.classify("@scope/pkg");
    expect(scoped?.form).toBe("npm");
    expect(scoped?.name).toBe("@scope/pkg");
    const path = EntryPredicate.classify("./local/dir");
    expect(path?.form).toBe("path");
    expect(path?.name).toBeNull();
  });

  test("baseName strips the version spec", () => {
    expect(EntryPredicate.baseName("@scope/pkg@1.0.0")).toBe("@scope/pkg");
    expect(EntryPredicate.baseName("pkg")).toBe("pkg");
  });
});

describe("EntryPredicate.matched", () => {
  test("matches npm entries by scoped name, any canonical spec", async () => {
    for (const entry of ["my-pkg", "my-pkg@latest", "my-pkg@1.2.3", { package: "my-pkg@latest" }]) {
      expect(await EntryPredicate.matched(entry, "my-pkg"), JSON.stringify(entry)).not.toBeNull();
    }
    expect(await EntryPredicate.matched("other-pkg@latest", "my-pkg")).toBeNull();
    expect(await EntryPredicate.matched("@scope/my-pkg@latest", "my-pkg")).toBeNull();
  });

  test("matches path-form entries only when they resolve to the package", async () => {
    expect(await EntryPredicate.matched("./nowhere/at/all", "my-pkg", import.meta.dirname)).toBeNull();
    expect(await EntryPredicate.matched("file:///Z:/no/such/dir", "my-pkg")).toBeNull();
    expect(await EntryPredicate.matched("https://example.com/pkg", "my-pkg")).toBeNull();
  });

  test("matches a file:/// entry whose target names the package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "entry-predicate-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "my-pkg", version: "1.0.0" }));
    const url = pathToFileURL(root).href;
    const matched = await EntryPredicate.matched(url, "my-pkg");
    expect(matched?.form).toBe("path");
    expect(await EntryPredicate.matched(url, "other-pkg")).toBeNull();
    expect(await EntryPredicate.matched(url.replace("file:///", "file:///Z:/"), "my-pkg")).toBeNull();
  });
});

