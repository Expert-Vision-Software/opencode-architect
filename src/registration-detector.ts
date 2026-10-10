import path from "node:path";
import type { EnsurePluginEntryOptions } from "./config-reader";
import { ConfigReader } from "./config-reader";
import { PluginEntryResolver } from "./plugin-entry";

export class RegistrationDetector {
  private readonly reader: ConfigReader;

  constructor(reader: ConfigReader = new ConfigReader()) {
    this.reader = reader;
  }

  public async findRegistration(
    packageName: string,
    options: EnsurePluginEntryOptions,
  ): Promise<string | null> {
    for (const read of await this.reader.readCandidates(options)) {
      if (read.entries.plugins === null) continue;
      const configDir = path.dirname(read.candidate.path);
      const registered =
        (await this.entryResolves(read.rawEntries.plugins, packageName, configDir)) ||
        (await this.entryResolves(read.rawEntries.plugin, packageName, configDir));
      if (registered) return read.candidate.path;
    }
    return null;
  }

  public hasMatchingEntry(entries: string[], packageName: string): boolean {
    return entries.some((entry) => this.matchesEntry(entry, packageName));
  }

  public async entryResolves(
    rawEntries: unknown[] | null,
    packageName: string,
    configDir: string,
  ): Promise<boolean> {
    if (rawEntries === null) return false;
    for (const entry of rawEntries) {
      if (await this.entryMatches(entry, packageName, configDir)) return true;
    }
    return false;
  }

  public async entryMatches(rawEntry: unknown, packageName: string, configDir: string): Promise<boolean> {
    const name = this.reader.normalizeEntry(rawEntry);
    if (name !== null && this.matchesEntry(name, packageName)) return true;
    return PluginEntryResolver.resolvesToPackage(rawEntry, packageName, configDir);
  }

  private matchesEntry(entry: string, packageName: string): boolean {
    const specIndex = entry.lastIndexOf("@");
    const name = specIndex > 0 ? entry.slice(0, specIndex) : entry;
    return name === packageName;
  }
}
