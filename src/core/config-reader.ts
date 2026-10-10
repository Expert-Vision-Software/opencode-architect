import { exists, readFile } from "node:fs/promises";
import path from "node:path";
import { EntryPredicate } from "./entry-predicate";
import { realEnvironment, type Environment, type WarnChannel } from "./environment";
import { scopeBase } from "./scope-base";

export type ConfigScope = "local" | "global";
export type PluginConfigKey = "plugins" | "plugin";

export interface EnsurePluginEntryOptions {
  scope: ConfigScope;
  projectDir: string;
}

export interface CandidateConfig {
  path: string;
  lenient: boolean;
  writable: boolean;
}

export interface CandidateRead {
  candidate: CandidateConfig;
  text: string;
  entries: Record<PluginConfigKey, string[] | null>;
  rawEntries: Record<PluginConfigKey, unknown[] | null>;
}

export interface ConfigEntries {
  path: string;
  lenient: boolean;
  writable: boolean;
  rawEntries: unknown[];
  parseError: string | null;
}

export class ConfigReader {
  constructor(private readonly environment: Environment = realEnvironment) {}

  public async entries(
    scope: ConfigScope,
    projectDir: string,
    warn: WarnChannel | null = null,
  ): Promise<ConfigEntries[]> {
    const results: ConfigEntries[] = [];
    for (const candidate of this.candidates({ scope, projectDir })) {
      if (!(await exists(candidate.path))) continue;
      const text = await readFile(candidate.path, "utf-8");
      const config = this.losslessParse(text, candidate.lenient);
      if (config === null) {
        if (warn !== null) {
          warn(`Warning: ${candidate.path} could not be parsed; its plugin entries are ignored.`);
        }
        results.push({
          path: candidate.path,
          lenient: candidate.lenient,
          writable: candidate.writable,
          rawEntries: [],
          parseError: `config file ${candidate.path} could not be parsed`,
        });
        continue;
      }
      results.push({
        path: candidate.path,
        lenient: candidate.lenient,
        writable: candidate.writable,
        rawEntries: [...this.entriesOf(config, "plugins"), ...this.entriesOf(config, "plugin")],
        parseError: null,
      });
    }
    return results;
  }

  private losslessParse(text: string, lenient: boolean): Record<string, unknown> | null {
    const parseable = lenient ? stripTrailingCommas(stripJsoncComments(text)) : text;
    try {
      const parsed = JSON.parse(parseable) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  public async readCandidates(options: EnsurePluginEntryOptions): Promise<CandidateRead[]> {
    const reads: CandidateRead[] = [];
    for (const candidate of this.candidates(options)) {
      if (!(await exists(candidate.path))) continue;
      const text = await readFile(candidate.path, "utf-8");
      const config = this.parseConfig(text, candidate.lenient);
      const entries: Record<PluginConfigKey, string[] | null> = { plugins: null, plugin: null };
      const rawEntries: Record<PluginConfigKey, unknown[] | null> = { plugins: null, plugin: null };
      if (config === null) {
        this.environment.warn(
          `Warning: ${candidate.path} could not be parsed; refusing to treat it as a registration candidate.`,
        );
      } else {
        for (const key of ["plugins", "plugin"] as PluginConfigKey[]) {
          entries[key] = this.keyEntries(config, key);
          rawEntries[key] = this.entriesOf(config, key);
        }
      }
      reads.push({ candidate, text, entries, rawEntries });
    }
    return reads;
  }

  public candidates(options: EnsurePluginEntryOptions): CandidateConfig[] {
    const scopeBasePath = scopeBase(options.scope, options.projectDir, this.environment);
    const configs: CandidateConfig[] = [];
    if (options.scope === "local") {
      for (const root of [scopeBasePath, options.projectDir]) {
        configs.push({ path: path.join(root, "opencode.json"), lenient: false, writable: true });
        configs.push({ path: path.join(root, "opencode.jsonc"), lenient: true, writable: true });
      }
    } else {
      for (const file of ["opencode.json", "opencode.jsonc"]) {
        configs.push({ path: path.join(scopeBasePath, file), lenient: file.endsWith(".jsonc"), writable: true });
      }
    }
    configs.push({ path: path.join(scopeBasePath, "config.json"), lenient: false, writable: false });
    return configs;
  }

  public parsePluginArray(text: string, lenient: boolean): string[] | null {
    const config = this.parseConfig(text, lenient);
    if (config === null) return null;
    return this.keyEntries(config, "plugins");
  }

  public parseConfig(text: string, lenient: boolean): Record<string, unknown> | null {
    const parseable = lenient ? this.blankComments(text).replace(/,(\s*[}\]])/g, "$1") : text;
    try {
      return JSON.parse(parseable) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  public blankComments(text: string): string {
    const chars = text.split("");
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < chars.length; i++) {
      const current = chars[i];
      const next = i + 1 < chars.length ? chars[i + 1] : "";
      if (inLineComment) {
        if (current === "\n") inLineComment = false;
        else chars[i] = " ";
        continue;
      }
      if (inBlockComment) {
        if (current === "*" && next === "/") {
          chars[i] = " ";
          chars[i + 1] = " ";
          i++;
          inBlockComment = false;
        } else {
          chars[i] = " ";
        }
        continue;
      }
      if (inString) {
        if (current === "\\") {
          i++;
          continue;
        }
        if (current === '"') inString = false;
        continue;
      }
      if (current === '"') {
        inString = true;
        continue;
      }
      if (current === "/" && next === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        inLineComment = true;
        continue;
      }
      if (current === "/" && next === "*") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        inBlockComment = true;
        continue;
      }
    }
    return chars.join("");
  }

  public keyEntries(config: Record<string, unknown>, key: PluginConfigKey): string[] {
    const value = config[key];
    if (!Array.isArray(value)) return [];
    return value.map((entry) => this.normalizeEntry(entry)).filter((entry): entry is string => entry !== null);
  }

  public entriesOf(config: Record<string, unknown>, key: PluginConfigKey): unknown[] {
    const value = config[key];
    return Array.isArray(value) ? value : [];
  }

  public normalizeEntry(entry: unknown): string | null {
    return EntryPredicate.specOf(entry);
  }

  public defaultConfigPath(options: EnsurePluginEntryOptions): string {
    if (options.scope === "global") {
      return path.join(scopeBase("global", options.projectDir, this.environment), "opencode.jsonc");
    }
    return path.join(options.projectDir, "opencode.jsonc");
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
