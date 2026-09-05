import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_FILENAMES, AgentLoader } from "../agent-loader";

const AGENTS_DIR = path.resolve(import.meta.dirname, "..", "assets", "agents");
const RELATIVE_REFERENCE_REGEX = /`((?:\.{1,2})(?:[\\/][^`\\/]+)+)`/g;
const ABSOLUTE_PATH_REGEX = /`([A-Za-z]:[\\/][^`]+|\/[^`]+)`/g;

function agentNames(): string[] {
  return AGENT_FILENAMES.map((filename) => path.basename(filename, ".md"));
}

async function readPromptBody(filename: string): Promise<string> {
  const content = await readFile(path.join(AGENTS_DIR, filename), "utf-8");
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function isReferenceFilePath(candidate: string): boolean {
  const looksAbsolute = /^[A-Za-z]:[\\/]/.test(candidate) || /^\/(?!\/)/.test(candidate);
  const lastSegment = candidate.split(/[\\/]/).pop() ?? "";
  return looksAbsolute && /\.[A-Za-z0-9]+$/.test(lastSegment);
}

describe("AgentLoader", () => {
  test("loadAgents returns all ten agents with non-empty prompts", async () => {
    const agents = await new AgentLoader(AGENTS_DIR).loadAgents();

    expect(Object.keys(agents).sort()).toEqual(agentNames().sort());
    expect(Object.keys(agents)).toHaveLength(10);

    for (const [name, agentConfig] of Object.entries(agents)) {
      const prompt = agentConfig.prompt ?? "";
      expect(prompt.trim().length, `${name} has an empty prompt`).toBeGreaterThan(0);
    }
  });

  test("every relative reference in agent markdown resolves to an existing bundled file", async () => {
    for (const filename of AGENT_FILENAMES) {
      const body = await readPromptBody(filename);

      for (const match of body.matchAll(RELATIVE_REFERENCE_REGEX)) {
        const relativePath = (match[1] ?? "").replaceAll("\\", "/");
        const absolutePath = path.resolve(AGENTS_DIR, relativePath);
        expect(
          existsSync(absolutePath),
          `${filename} references missing bundled file ${relativePath}`,
        ).toBe(true);
      }
    }
  });

  test("loaded prompts contain no relative references and only resolvable absolute file paths", async () => {
    const agents = await new AgentLoader(AGENTS_DIR).loadAgents();

    for (const [name, agentConfig] of Object.entries(agents)) {
      const prompt = agentConfig.prompt ?? "";

      const leftoverRelative = [...prompt.matchAll(RELATIVE_REFERENCE_REGEX)].map(
        (match) => match[1] ?? "",
      );
      expect(leftoverRelative, `${name} keeps unrewritten relative references`).toEqual([]);

      for (const match of prompt.matchAll(ABSOLUTE_PATH_REGEX)) {
        const candidate = match[1] ?? "";
        if (!isReferenceFilePath(candidate)) {
          continue;
        }
        expect(existsSync(candidate), `${name} references missing file ${candidate}`).toBe(true);
      }
    }
  });
});
