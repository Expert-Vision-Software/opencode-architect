import { describe, expect, test } from "bun:test";
import path from "node:path";
import { DocsFactGate, MUST_CITE_FACTS } from "./docs-fact-gate";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPO_CONTENT = ["AGENTS.md", "CONTEXT.md", "CONTRIBUTING.md", "README.md"];

const gate = new DocsFactGate(ROOT);

describe("docs-fact gate (guidance suite traces to the verified-facts record)", () => {
  test("every reference file carries no known-false v1 claim", async () => {
    const all: string[] = [];
    for (const name of gate.guidanceFiles()) {
      const content = await gate.referenceContent(name);
      all.push(...(await gate.findViolations(name, content)));
    }
    expect(all).toEqual([]);
  });

  test("repo content (README, AGENTS.md, CONTRIBUTING, CONTEXT.md) carries no known-false v1 claim", async () => {
    const all: string[] = [];
    for (const name of REPO_CONTENT) {
      const content = await gate.fileContent(name);
      all.push(...(await gate.findViolations(name, content)));
    }
    expect(all).toEqual([]);
  });

  test("API-teaching references cite the verified-facts record", async () => {
    for (const name of MUST_CITE_FACTS) {
      expect(gate.guidanceFiles(), `${name} exists`).toContain(name);
      const content = await gate.referenceContent(name);
      expect(
        /opencode-v2-facts/.test(content),
        `${name} must cite docs/reference/opencode-v2-facts.md`,
      ).toBe(true);
    }
  });
});
