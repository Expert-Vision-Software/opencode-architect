import { exists, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type ConfigScope = "local" | "global";

export interface ConfigCandidate {
  path: string;
  lenient: boolean;
  writable: boolean;
}

export interface ConfigEntries {
  configPath: string;
  rawEntries: unknown[];
  parseError: string | null;
}

export class ConfigEntriesReader {
  public candidates(scope: ConfigScope, projectDir: string): ConfigCandidate[] {
    const scopeBase = this.scopeBase(scope, projectDir);
    const configs: ConfigCandidate[] = [];
    if (scope === "local") {
      for (const root of [scopeBase, projectDir]) {
        configs.push({ path: path.join(root, "opencode.json"), lenient: false, writable: true });
        configs.push({ path: path.join(root, "opencode.jsonc"), lenient: true, writable: true });
      }
    } else {
      for (const file of ["opencode.json", "opencode.jsonc"]) {
        configs.push({ path: path.join(scopeBase, file), lenient: file.endsWith(".jsonc"), writable: true });
      }
    }
    configs.push({ path: path.join(scopeBase, "config.json"), lenient: false, writable: false });
    return configs;
  }

  public async read(scope: ConfigScope, projectDir: string, warn: boolean): Promise<ConfigEntries[]> {
    const results: ConfigEntries[] = [];
    for (const candidate of this.candidates(scope, projectDir)) {
      if (!(await exists(candidate.path))) continue;
      const text = await readFile(candidate.path, "utf-8");
      const config = this.parseConfig(text, candidate.lenient);
      if (config === null) {
        if (warn) {
          console.warn(`Warning: ${candidate.path} could not be parsed; its plugin entries are ignored.`);
        }
        results.push({
          configPath: candidate.path,
          rawEntries: [],
          parseError: `config file ${candidate.path} could not be parsed`,
        });
        continue;
      }
      results.push({ configPath: candidate.path, rawEntries: this.pluginEntries(config), parseError: null });
    }
    return results;
  }

  private pluginEntries(config: Record<string, unknown>): unknown[] {
    return [...this.arrayEntries(config, "plugins"), ...this.arrayEntries(config, "plugin")];
  }

  private arrayEntries(config: Record<string, unknown>, key: string): unknown[] {
    const value = config[key];
    return Array.isArray(value) ? value : [];
  }

  private scopeBase(scope: ConfigScope, projectDir: string): string {
    if (scope === "local") return path.join(projectDir, ".opencode");
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) return path.join(xdgConfigHome, "opencode");
    return path.join(homedir(), ".config", "opencode");
  }

  private parseConfig(text: string, lenient: boolean): Record<string, unknown> | null {
    const parseable = lenient ? stripTrailingCommas(stripJsoncComments(text)) : text;
    try {
      const parsed = JSON.parse(parseable) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function stripJsoncComments(text: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function stripTrailingCommas(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      out += ch;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          out += text[i] + (text[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += text[i];
        const closed = text[i] === '"';
        i++;
        if (closed) break;
      }
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j] ?? "")) j++;
      if (text[j] === "]" || text[j] === "}") {
        i++;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}
