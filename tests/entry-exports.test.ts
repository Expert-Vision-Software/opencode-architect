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

  test("default export is callable without new and yields a config hook", async () => {
    const mod = await importEntry();
    const factory = mod.default as unknown as () => Promise<Record<string, unknown>>;
    const hooks = await factory();
    expect(typeof hooks.config).toBe("function");
  });
});
