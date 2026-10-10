import { exists, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateConfig, CandidateRead, EnsurePluginEntryOptions } from "./config-reader";
import { ConfigReader } from "./config-reader";
import { RegistrationDetector } from "./registration-detector";
import { ConfigSplicer } from "./config-splicer";

export type { ConfigScope, PluginConfigKey, EnsurePluginEntryOptions } from "./config-reader";

export interface EnsurePluginEntryOutcome {
  action: "noop" | "updated" | "created" | "blocked";
  configPath: string | null;
  warning: string | null;
}

export interface RemovePluginEntryOutcome {
  action: "noop" | "removed" | "blocked";
  configPath: string | null;
  warning: string | null;
}

export type ConfigCheck = { ok: true } | { ok: false; warning: string };

const DEFAULT_CONFIG_TEMPLATE = `{
  // OpenCode configuration
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["__PACKAGE_NAME__"]
}
`;

export class PluginConfigEditor {
  private readonly reader = new ConfigReader();
  private readonly detector = new RegistrationDetector(this.reader);
  private readonly splicer = new ConfigSplicer(this.reader, this.detector);

  public async ensurePluginEntry(
    packageName: string,
    options: EnsurePluginEntryOptions,
  ): Promise<EnsurePluginEntryOutcome> {
    const canonical = this.canonicalEntry(packageName);
    for (const read of await this.reader.readCandidates(options)) {
      const { candidate, text, entries, rawEntries } = read;
      const configDir = path.dirname(candidate.path);
      if (entries.plugins === null) {
        return {
          action: "blocked",
          configPath: candidate.path,
          warning:
            `Config file ${candidate.path} could not be parsed; refusing to modify it. ` +
            `Fix or remove the file and re-run the install.`,
        };
      }
      if (await this.detector.entryResolves(rawEntries.plugins, packageName, configDir)) {
        return { action: "noop", configPath: candidate.path, warning: null };
      }
      if (await this.detector.entryResolves(rawEntries.plugin, packageName, configDir)) {
        return {
          action: "noop",
          configPath: candidate.path,
          warning: this.legacyEntryAdvisory(candidate, packageName),
        };
      }
      if (!candidate.writable) continue;
      const spliced = this.splicer.spliceEntry(text, canonical, packageName, candidate.lenient);
      if (spliced === null) {
        return {
          action: "blocked",
          configPath: candidate.path,
          warning: `Plugin array in ${candidate.path} could not be safely edited; file left untouched.`,
        };
      }
      await mkdir(path.dirname(candidate.path), { recursive: true });
      await writeFile(candidate.path, spliced);
      return { action: "updated", configPath: candidate.path, warning: null };
    }

    const target = this.reader.defaultConfigPath(options);
    const content = DEFAULT_CONFIG_TEMPLATE.replace("__PACKAGE_NAME__", canonical);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    return { action: "created", configPath: target, warning: null };
  }

  public async checkParseable(options: EnsurePluginEntryOptions): Promise<ConfigCheck> {
    for (const candidate of this.reader.candidates(options)) {
      if (!(await exists(candidate.path))) continue;
      const text = await readFile(candidate.path, "utf-8");
      if (this.reader.parsePluginArray(text, candidate.lenient) === null) {
        return {
          ok: false,
          warning:
            `Config file ${candidate.path} could not be parsed; refusing to modify it. ` +
            `Fix or remove the file and re-run the command.`,
        };
      }
    }
    return { ok: true };
  }

  public async findRegistration(
    packageName: string,
    options: EnsurePluginEntryOptions,
  ): Promise<string | null> {
    return this.detector.findRegistration(packageName, options);
  }

  public async removePluginEntry(
    packageName: string,
    options: EnsurePluginEntryOptions,
  ): Promise<RemovePluginEntryOutcome> {
    const reads = await this.reader.readCandidates(options);
    let legacyPath: string | null = null;
    for (const read of reads) {
      const { candidate, text, entries } = read;
      const configDir = path.dirname(candidate.path);
      if (!candidate.writable) continue;
      if (entries.plugins === null) {
        return {
          action: "blocked",
          configPath: candidate.path,
          warning:
            `Config file ${candidate.path} could not be parsed; refusing to modify it. ` +
            `Fix or remove the file and re-run the uninstall.`,
        };
      }
      if (await this.detector.entryResolves(read.rawEntries.plugins, packageName, configDir)) {
        const spliced = await this.splicer.spliceOutEntry(text, packageName, candidate.lenient, configDir);
        if (spliced === null) {
          return {
            action: "blocked",
            configPath: candidate.path,
            warning: `Plugin array in ${candidate.path} could not be safely edited; file left untouched.`,
          };
        }
        await writeFile(candidate.path, spliced);
        const leftover = await this.findLegacyConfig(reads, packageName);
        return {
          action: "removed",
          configPath: candidate.path,
          warning: leftover === null ? null : this.legacyRemovalAdvisory(leftover, packageName),
        };
      }
      if (legacyPath === null && (await this.detector.entryResolves(read.rawEntries.plugin, packageName, configDir))) {
        legacyPath = candidate.path;
      }
    }
    if (legacyPath !== null) {
      return {
        action: "noop",
        configPath: legacyPath,
        warning: this.legacyRemovalAdvisory(legacyPath, packageName),
      };
    }
    return { action: "noop", configPath: null, warning: null };
  }

  public hasMatchingEntry(entries: string[], packageName: string): boolean {
    return this.detector.hasMatchingEntry(entries, packageName);
  }

  private async findLegacyConfig(reads: CandidateRead[], packageName: string): Promise<string | null> {
    for (const read of reads) {
      const legacyDir = path.dirname(read.candidate.path);
      if (await this.detector.entryResolves(read.rawEntries.plugin, packageName, legacyDir)) {
        return read.candidate.path;
      }
    }
    return null;
  }

  private legacyEntryAdvisory(candidate: CandidateConfig, packageName: string): string {
    if (path.basename(candidate.path) === "config.json") {
      return (
        `${candidate.path} registers ${packageName} under the legacy v1 "plugin" key. ` +
        `OpenCode v2 no longer reads config.json, so the entry is inert, and this installer never edits it. ` +
        `Add ${packageName} to the "plugins" key of an opencode.json or opencode.jsonc config instead.`
      );
    }
    return (
      `${candidate.path} registers ${packageName} under the legacy v1 "plugin" key. ` +
      `OpenCode v2 still loads it through config migration, and this installer leaves legacy entries ` +
      `read-only. Move the entry to the v2 "plugins" key to upgrade, then re-run the install.`
    );
  }

  private legacyRemovalAdvisory(configPath: string, packageName: string): string {
    return (
      `${configPath} registers ${packageName} under the legacy v1 "plugin" key; it was left untouched. ` +
      `Remove it by editing the file, or move the entry to the v2 "plugins" key and re-run the uninstall.`
    );
  }

  private canonicalEntry(packageName: string): string {
    const specIndex = packageName.lastIndexOf("@");
    if (specIndex > 0) return packageName;
    return `${packageName}@latest`;
  }
}
