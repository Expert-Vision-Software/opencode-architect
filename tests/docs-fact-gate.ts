import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface Marker {
  pattern: RegExp;
  reason: string;
  exempt: RegExp | null;
}

export const V1_MARKERS: Marker[] = [
  {
    pattern: /@opencode-ai\/plugin/,
    exempt: null,
    reason: "v1 plugin package name (v2 is @opencode/plugin — facts §1)",
  },
  {
    pattern:
      /["'](plugin|tools|tool|permission|agent|autoupdate|autoshare|small_model|enabled_providers|disabled_providers|attachment|snapshot|subagent_depth|logLevel|server|layout)["']\s*:/,
    exempt: null,
    reason:
      "v1 config key emitted as a key (facts §5 — v2 keys are plural arrays / renamed)",
  },
  {
    pattern: /tool\.schema/,
    exempt: /\bv1\b|gone/i,
    reason:
      "v1 tool.schema argument style (v2: JSON Schema / Schema.Codec / Standard Schema — facts §8)",
  },
  {
    pattern: /(?<![\w.-])config\.json/,
    exempt:
      /\$schema|never reads|no longer read|read-only|legacy|inert|never edit/i,
    reason:
      "v2 never reads config.json — only read-only legacy advisories may name it (facts §5, §13 row 3)",
  },
  {
    pattern: /opencode\/packages|\.opencode\/tools/,
    exempt: /no file-based|no v2 equivalent|\bv1\b/i,
    reason: "v1 cache location / v1 file-based tool directory (facts §7, §8)",
  },
  {
    pattern:
      /["'](chat\.message|chat\.params|chat\.headers|permission\.asked|shell\.env|experimental\.chat|experimental\.session\.compacting|installation\.updated|tui\.prompt\.append)["']\s*:/,
    exempt: null,
    reason:
      "v1 hook name asserted as a live hook key (v2 replacements — facts §9)",
  },
  {
    pattern: /^\s*(temperature|top_p|maxSteps|disable|prompt)\s*:/,
    exempt: null,
    reason:
      "v1 agent frontmatter field asserted as current (v2 mapping — facts §6)",
  },
  {
    pattern: /@opencode\/plugin@\d|"effect"\s*:\s*"\d|effect@\d/,
    exempt: null,
    reason:
      "consumer guidance pins a package version — must resolve latest (facts §15)",
  },
];

export const MUST_CITE_FACTS = [
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

export class DocsFactGate {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  public guidanceFiles(): string[] {
    return readdirSync(path.join(this.root, "references"))
      .filter((name) => name.endsWith(".md"))
      .sort();
  }

  public async findViolations(
    file: string,
    content: string,
  ): Promise<string[]> {
    const found: string[] = [];
    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const marker of V1_MARKERS) {
        const exempt = marker.exempt === null || marker.exempt.test(line);
        if (marker.pattern.test(line) && !exempt) {
          found.push(`${file}:${index + 1} — ${marker.reason}\n    ${line.trim()}`);
        }
      }
    }
    return found;
  }

  public async fileContent(file: string): Promise<string> {
    return readFile(path.join(this.root, file), "utf-8");
  }

  public async referenceContent(name: string): Promise<string> {
    return readFile(path.join(this.root, "references", name), "utf-8");
  }
}
