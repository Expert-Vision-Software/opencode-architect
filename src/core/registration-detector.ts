import path from "node:path";
import type { EnsurePluginEntryOptions } from "./config-reader";
import { ConfigReader } from "./config-reader";
import { EntryPredicate } from "./entry-predicate";

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
    return entries.some((entry) => EntryPredicate.matchesName(entry, packageName));
  }

  public async entryResolves(
    rawEntries: unknown[] | null,
    packageName: string,
    configDir: string,
  ): Promise<boolean> {
    if (rawEntries === null) return false;
    for (const entry of rawEntries) {
      if (await EntryPredicate.matches(entry, packageName, configDir)) return true;
    }
    return false;
  }
}
