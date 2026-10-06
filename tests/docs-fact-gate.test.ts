import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Docs-fact gate (spec #23, testing seam 5): every OpenCode API fact the
// guidance suite asserts must trace to the verified-facts record
// (docs/reference/opencode-v2-facts.md, issue #24). This gate fails on
// known-false v1 claims re-entering the guidance files and on
// API-teaching references that lack a facts citation. Facts §15 governs:
// assertions must be settled/hedged in the record; v1 names may appear
// only inside explicit v1→v2 migration mappings.

const ROOT = path.resolve(import.meta.dirname, "..");
const REFERENCES_DIR = path.join(ROOT, "references");

interface Marker {
  /** Banned assertion form (not a bare word — migration tables are fine). */
  pattern: RegExp;
  reason: string;
  /** A line matching the exemption is treated as a legitimate migration mention. */
  exempt?: RegExp;
}

const V1_MARKERS: Marker[] = [
  {
    pattern: /@opencode-ai\/plugin/,
    reason: "v1 plugin package name (v2 is @opencode/plugin — facts §1)",
  },
  {
    pattern: /(?<![\w.-])config\.json/,
    exempt:
      /\$schema|never reads|no longer read|read-only|legacy|inert|never edit/i,
    reason: "v2 never reads config.json — only read-only legacy advisories may name it (facts §5, §13 row 3)",
  },
  {
    pattern:
      /["'](plugin|tools|tool|permission|agent|autoupdate|autoshare|small_model|enabled_providers|disabled_providers|attachment|snapshot|subagent_depth|logLevel|server|layout)["']\s*:/,
    reason: "v1 config key emitted as a key (facts §5 — v2 keys are plural arrays / renamed)",
  },
  {
    pattern: /tool\.schema/,
    exempt: /\bv1\b|gone/i,
    reason: "v1 tool.schema argument style (v2: JSON Schema / Schema.Codec / Standard Schema — facts §8)",
  },
  {
    pattern: /opencode\/packages|\.opencode\/tools/,
    exempt: /no file-based|no v2 equivalent|\bv1\b/i,
    reason: "v1 cache location / v1 file-based tool directory (facts §7, §8)",
  },
  {
    pattern:
      /["'](chat\.message|chat\.params|chat\.headers|permission\.asked|shell\.env|experimental\.chat|experimental\.session\.compacting|installation\.updated|tui\.prompt\.append)["']\s*:/,
    reason: "v1 hook name asserted as a live hook key (v2 replacements — facts §9)",
  },
  {
    pattern: /^\s*(temperature|top_p|maxSteps|disable|prompt)\s*:/,
    reason: "v1 agent frontmatter field asserted as current (v2 mapping — facts §6)",
  },
  {
    pattern: /@opencode\/plugin@\d|"effect"\s*:\s*"\d|effect@\d/,
    reason: "consumer guidance pins a package version — must resolve latest (facts §15)",
  },
];

/** References that teach opencode APIs must cite the facts record. */
const MUST_CITE_FACTS = [
  "agents.md",
  "commands.md",
  "config.md",
  "conformance-checklist.md",
  "live-knowledge-fallback.md",
  "mcp-servers.md",
  "opencode-architect-oneshots.md",
  "plugins.md",
  "skills.md",
  "tools.md",
];

/** Repo content that ships guidance-adjacent claims. */
const REPO_CONTENT = [
  "AGENTS.md",
  "CONTEXT.md",
  "CONTRIBUTING.md",
  "README.md",
];

const guidanceFiles = readdirSync(REFERENCES_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

async function violations(file: string, content: string): Promise<string[]> {
  const found: string[] = [];
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const marker of V1_MARKERS) {
      if (marker.pattern.test(line) && !(marker.exempt ?? /(?!x)x/).test(line)) {
        found.push(
          `${file}:${index + 1} — ${marker.reason}\n    ${line.trim()}`,
        );
      }
    }
  }
  return found;
}

describe("docs-fact gate (guidance suite traces to the verified-facts record)", () => {
  test("every reference file carries no known-false v1 claim", async () => {
    const all: string[] = [];
    for (const name of guidanceFiles) {
      const content = await readFile(path.join(REFERENCES_DIR, name), "utf-8");
      all.push(...(await violations(name, content)));
    }
    expect(all).toEqual([]);
  });

  test("repo content (README, AGENTS.md, CONTRIBUTING, CONTEXT.md) carries no known-false v1 claim", async () => {
    const all: string[] = [];
    for (const name of REPO_CONTENT) {
      const content = await readFile(path.join(ROOT, name), "utf-8");
      all.push(...(await violations(name, content)));
    }
    expect(all).toEqual([]);
  });

  test("API-teaching references cite the verified-facts record", async () => {
    for (const name of MUST_CITE_FACTS) {
      expect(guidanceFiles, `${name} exists`).toContain(name);
      const content = await readFile(path.join(REFERENCES_DIR, name), "utf-8");
      expect(
        /opencode-v2-facts/.test(content),
        `${name} must cite docs/reference/opencode-v2-facts.md`,
      ).toBe(true);
    }
  });
});
