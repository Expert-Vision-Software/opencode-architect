import { exists, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

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

export class ConfigReader {
  public async readCandidates(options: EnsurePluginEntryOptions): Promise<CandidateRead[]> {
    const reads: CandidateRead[] = [];
    for (const candidate of this.candidates(options)) {
      if (!(await exists(candidate.path))) continue;
      const text = await readFile(candidate.path, "utf-8");
      const config = this.parseConfig(text, candidate.lenient);
      const entries: Record<PluginConfigKey, string[] | null> = { plugins: null, plugin: null };
      const rawEntries: Record<PluginConfigKey, unknown[] | null> = { plugins: null, plugin: null };
      if (config === null) {
        console.warn(
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
    const scopeBase = this.scopeBase(options.scope, options.projectDir);
    const configs: CandidateConfig[] = [];
    if (options.scope === "local") {
      for (const root of [scopeBase, options.projectDir]) {
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
    if (typeof entry === "string") return entry;
    return this.packageOf(entry);
  }

  public packageOf(entry: unknown): string | null {
    if (entry === null || typeof entry !== "object") return null;
    const pkg = (entry as { package: unknown }).package;
    return typeof pkg === "string" ? pkg : null;
  }

  public defaultConfigPath(options: EnsurePluginEntryOptions): string {
    if (options.scope === "global") {
      return path.join(this.scopeBase("global", options.projectDir), "opencode.jsonc");
    }
    return path.join(options.projectDir, "opencode.jsonc");
  }

  private scopeBase(scope: ConfigScope, projectDir: string): string {
    if (scope === "local") return path.join(projectDir, ".opencode");
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) return path.join(xdgConfigHome, "opencode");
    return path.join(homedir(), ".config", "opencode");
  }
}
