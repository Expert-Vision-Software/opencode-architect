import { exists, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateConfig, CandidateRead, EnsurePluginEntryOptions } from "./config-reader";
import { ConfigReader } from "./config-reader";
import { RegistrationDetector } from "./registration-detector";

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
      const spliced = this.spliceEntry(text, canonical, packageName, candidate.lenient);
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
        const spliced = await this.spliceOutEntry(text, packageName, candidate.lenient, configDir);
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

  private spliceEntry(
    text: string,
    entryToWrite: string,
    packageName: string,
    lenient: boolean,
  ): string | null {
    const navigable = this.reader.blankComments(text);
    const range = this.findPluginArrayRange(navigable);
    const spliced =
      range === null
        ? this.splicePluginKey(text, navigable, entryToWrite)
        : this.spliceArrayEntry(text, navigable, range, entryToWrite);
    if (spliced === null) return null;
    const plugins = this.reader.parsePluginArray(spliced, lenient);
    if (plugins === null || !this.detector.hasMatchingEntry(plugins, packageName)) return null;
    return spliced;
  }

  private async spliceOutEntry(
    text: string,
    packageName: string,
    lenient: boolean,
    configDir: string,
  ): Promise<string | null> {
    const navigable = this.reader.blankComments(text);
    const range = this.findPluginArrayRange(navigable);
    if (range === null) return null;
    const innerStart = range.bracketStart + 1;
    const innerEnd = range.bracketEnd;
    const elements = this.arrayElementRanges(navigable, innerStart, innerEnd);
    const target = await this.matchingElement(text, elements, packageName, configDir);
    if (!target) return null;
    const withComma = this.dropAdjacentComma(navigable, elements, target, innerStart, innerEnd);
    const result = text.slice(0, withComma.start) + text.slice(withComma.end);
    const config = this.reader.parseConfig(result, lenient);
    if (config === null) return null;
    if (await this.detector.entryResolves(this.reader.entriesOf(config, "plugins"), packageName, configDir)) {
      return null;
    }
    return result;
  }

  private async matchingElement(
    text: string,
    elements: Array<{ start: number; end: number }>,
    packageName: string,
    configDir: string,
  ): Promise<{ start: number; end: number } | null> {
    for (const element of elements) {
      const spec = this.elementSpec(text.slice(element.start, element.end));
      if (await this.detector.entryMatches(spec, packageName, configDir)) return element;
    }
    return null;
  }

  private arrayElementRanges(
    navigable: string,
    innerStart: number,
    innerEnd: number,
  ): Array<{ start: number; end: number }> {
    const elements: Array<{ start: number; end: number }> = [];
    let inString = false;
    let depth = 0;
    let start = -1;
    for (let i = innerStart; i < innerEnd; i++) {
      const current = navigable[i];
      if (inString) {
        if (current === "\\") i++;
        else if (current === '"') inString = false;
        continue;
      }
      if (current === '"') {
        inString = true;
        if (start === -1) start = i;
        continue;
      }
      if (current === "[" || current === "{") {
        depth++;
        if (start === -1) start = i;
        continue;
      }
      if (current === "]" || current === "}") {
        depth--;
        continue;
      }
      if (current === "," && depth === 0) {
        if (start !== -1) elements.push({ start, end: i });
        start = -1;
        continue;
      }
      if (!/\s/.test(current ?? "") && start === -1) start = i;
    }
    if (start !== -1) elements.push({ start, end: innerEnd });
    return elements;
  }

  private dropAdjacentComma(
    navigable: string,
    elements: Array<{ start: number; end: number }>,
    target: { start: number; end: number },
    innerStart: number,
    innerEnd: number,
  ): { start: number; end: number } {
    const index = elements.indexOf(target);
    const next = elements[index + 1];
    if (next) return { start: target.start, end: next.start };
    const previous = elements[index - 1];
    if (previous) return { start: previous.end, end: target.end };
    let start = target.start;
    while (start > innerStart && /\s/.test(navigable[start - 1] ?? "")) start--;
    let end = target.end;
    while (end < innerEnd && /\s/.test(navigable[end] ?? "")) end++;
    return { start, end };
  }

  private unquote(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private elementSpec(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{")) return this.unquote(trimmed);
    try {
      return this.reader.packageOf(JSON.parse(trimmed.replace(/,(\s*[}\]])/g, "$1"))) ?? "";
    } catch {
      return "";
    }
  }

  private spliceArrayEntry(
    text: string,
    navigable: string,
    range: PluginArrayRange,
    packageName: string,
  ): string | null {
    const innerStart = range.bracketStart + 1;
    const inner = text.slice(innerStart, range.bracketEnd);
    const firstElementOffset = inner.search(/\S/);
    if (firstElementOffset === -1) {
      return text.slice(0, innerStart) + `"${packageName}"` + text.slice(range.bracketEnd);
    }
    const insertAt = innerStart + firstElementOffset;
    const leadingWhitespace = inner.slice(0, firstElementOffset);
    return text.slice(0, insertAt) + leadingWhitespace + `"${packageName}",` + text.slice(insertAt);
  }

  private splicePluginKey(text: string, navigable: string, packageName: string): string | null {
    const objectStart = this.firstStructuralChar(navigable, "{");
    if (objectStart === -1) return null;
    const rest = text.slice(objectStart + 1);
    const nextContentOffset = rest.search(/\S/);
    if (nextContentOffset === -1) return null;
    const insertAt = objectStart + 1 + nextContentOffset;
    const isClosingBrace = rest[nextContentOffset] === "}";
    const entry = isClosingBrace ? `"plugins": ["${packageName}"]` : `"plugins": ["${packageName}"],`;
    const leadingWhitespace = nextContentOffset > 0 ? rest.slice(0, nextContentOffset) : "";
    return text.slice(0, insertAt) + leadingWhitespace + entry + text.slice(insertAt);
  }

  private findPluginArrayRange(navigable: string): PluginArrayRange | null {
    let searchFrom = 0;
    while (searchFrom < navigable.length) {
      const keyIndex = navigable.indexOf('"plugins"', searchFrom);
      if (keyIndex === -1) return null;
      if (this.precededByStructuralChar(navigable, keyIndex, ["{", ","])) {
        const colonIndex = this.nextOutsideString(navigable, keyIndex + '"plugins"'.length, ":");
        if (colonIndex !== -1) {
          const bracketStart = this.nextOutsideString(navigable, colonIndex + 1, "[");
          if (bracketStart !== -1) {
            const bracketEnd = this.matchingBracket(navigable, bracketStart);
            if (bracketEnd !== null) return { bracketStart, bracketEnd };
          }
        }
      }
      searchFrom = keyIndex + 1;
    }
    return null;
  }

  private precededByStructuralChar(text: string, index: number, allowed: string[]): boolean {
    for (let i = index - 1; i >= 0; i--) {
      const current: string = text[i] ?? "";
      if (/\s/.test(current)) continue;
      return allowed.includes(current);
    }
    return false;
  }

  private firstStructuralChar(text: string, target: string): number {
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      const current = text[i];
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
      if (current === target) return i;
    }
    return -1;
  }

  private nextOutsideString(text: string, from: number, target: string): number {
    let inString = false;
    for (let i = from; i < text.length; i++) {
      const current = text[i];
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
      if (current === target) return i;
    }
    return -1;
  }

  private matchingBracket(text: string, bracketStart: number): number | null {
    let depth = 0;
    let inString = false;
    for (let i = bracketStart; i < text.length; i++) {
      const current = text[i];
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
      if (current === "[") depth++;
      else if (current === "]") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return null;
  }
}

interface PluginArrayRange {
  bracketStart: number;
  bracketEnd: number;
}
