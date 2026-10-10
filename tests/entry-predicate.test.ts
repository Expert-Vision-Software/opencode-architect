import { describe, expect, test } from "bun:test";
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
