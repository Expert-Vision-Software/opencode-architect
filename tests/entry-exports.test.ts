import { describe, expect, test } from "bun:test";

type EntryModule = Record<string, unknown>;

async function importEntry(): Promise<EntryModule> {
  return (await import("../index")) as EntryModule;
}

function nonDefaultKeys(mod: EntryModule): string[] {
  return Object.keys(mod).filter((key) => key !== "default");
}

describe("package entry module", () => {
  test("exports nothing besides default", async () => {
    const mod = await importEntry();
    expect(nonDefaultKeys(mod)).toEqual([]);
  });

  test("default export is a v2 plugin definition with a stable id and an effect", async () => {
    const mod = await importEntry();
    const definition = mod.default as unknown as { id: unknown; effect: unknown };
    expect(typeof definition.id).toBe("string");
    expect((definition.id as string).length).toBeGreaterThan(0);
    expect(typeof definition.effect).toBe("function");
  });
});
