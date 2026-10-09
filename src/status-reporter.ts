import { PACKAGE_NAME } from "./cache-cleaner";
import { ConfigEntriesReader, type ConfigEntries } from "./config-entries";
import { LoadedVersionResolver, type ResolvedSource } from "./loaded-version";
import { PluginEntryResolver } from "./plugin-entry";
import { RegistryVersionChecker } from "./registry-version-checker";
import { EntrySpec } from "./entry-spec";
import type { InstallMode, Scope } from "./installer";

export interface ManifestState {
  mode: InstallMode;
  version: string;
}

export interface ManifestLookup {
  manifestAt(scope: Scope, projectDir: string): Promise<ManifestState | null>;
}

export interface ScopeStatusReport {
  scope: Scope;
  registered: boolean;
  mode: InstallMode;
  manifestVersion: string | null;
  configPath: string | null;
  entryText: string | null;
  entryName: string | null;
  entryForm: "npm" | "path" | null;
  resolved: ResolvedSource | null;
  warnings: string[];
}

export interface EffectiveVersion {
  version: string | null;
  source: "cache" | "checkout" | null;
  scope: Scope | null;
  latestVersion: string | null;
  registeredScopes: Scope[];
}

export interface StatusReport {
  projectDir: string;
  scopes: ScopeStatusReport[];
  effective: EffectiveVersion;
  warnings: string[];
}

export interface StatusReportOptions {
  scopes: Scope[] | null;
  online: boolean;
}

interface MatchedEntry {
  configPath: string;
  entry: unknown;
  display: string;
  name: string | null;
  form: "npm" | "path";
}

export class StatusReporter {
  private readonly entries = new ConfigEntriesReader();
  private readonly resolver = new LoadedVersionResolver();

  constructor(
    private readonly manifests: ManifestLookup,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  public async report(projectDir: string, options: StatusReportOptions): Promise<StatusReport> {
    const scopes = options.scopes ?? (["local", "global"] as Scope[]);
    const reports: ScopeStatusReport[] = [];
    for (const scope of scopes) {
      reports.push(await this.resolveScope(scope, projectDir));
    }
    const warnings = this.crossScopeWarnings(reports);
    let effective = this.effectiveVersion(reports);
    if (options.online) {
      const online = await this.onlinePass(reports, effective);
      warnings.push(...online.warnings);
      effective = online.effective;
    }
    return { projectDir, scopes: reports, effective, warnings };
  }

  public static formatAge(modifiedMs: number | null): string | null {
    if (modifiedMs === null) return null;
    const minutes = Math.floor((Date.now() - modifiedMs) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m old`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h old`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d old`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo old`;
    return `${Math.floor(days / 365)}y old`;
  }

  private async resolveScope(scope: Scope, projectDir: string): Promise<ScopeStatusReport> {
    const warnings: string[] = [];
    const entries = await this.entries.read(scope, projectDir, false);
    for (const candidate of entries) {
      if (candidate.parseError !== null) warnings.push(candidate.parseError);
    }
    const manifestState = await this.manifests.manifestAt(scope, projectDir);
    const matched = await this.findMatchedEntry(entries);
    if (matched === null) {
      return {
        scope,
        registered: false,
        mode: manifestState?.mode ?? "none",
        manifestVersion: manifestState?.version ?? null,
        configPath: null,
        entryText: null,
        entryName: null,
        entryForm: null,
        resolved: null,
        warnings,
      };
    }
    const resolution = await this.resolver.resolve(matched.entry);
    let resolved: ResolvedSource | null = null;
    if (resolution.status === "resolved") {
      resolved = resolution.source;
    } else if (resolution.status === "missing") {
      warnings.push(`${scope}: no cached copy for ${matched.display} (${resolution.attempted})`);
    } else if (resolution.status === "partial") {
      warnings.push(`${scope}: cached copy for ${matched.display} is incomplete (${resolution.attempted})`);
    }
    const manifestVersion = manifestState?.version ?? null;
    if (manifestVersion !== null && resolved !== null && resolved.version !== null && manifestVersion !== resolved.version) {
      warnings.push(`${scope}: manifest records ${manifestVersion} but the resolved copy is ${resolved.version}`);
    }
    return {
      scope,
      registered: true,
      mode: manifestState?.mode ?? "plugin",
      manifestVersion,
      configPath: matched.configPath,
      entryText: matched.display,
      entryName: matched.name,
      entryForm: matched.form,
      resolved,
      warnings,
    };
  }

  private async findMatchedEntry(entries: ConfigEntries[]): Promise<MatchedEntry | null> {
    for (const candidate of entries) {
      for (const raw of candidate.rawEntries) {
        const classified = EntrySpec.classify(raw);
        if (classified === null) continue;
        if (classified.form === "npm") {
          if (classified.name === PACKAGE_NAME) {
            return {
              configPath: candidate.configPath,
              entry: raw,
              display: classified.display,
              name: classified.name,
              form: "npm",
            };
          }
          continue;
        }
        if (await PluginEntryResolver.resolvesToPackage(raw, PACKAGE_NAME)) {
          return {
            configPath: candidate.configPath,
            entry: raw,
            display: classified.display,
            name: null,
            form: "path",
          };
        }
      }
    }
    return null;
  }

  private crossScopeWarnings(reports: ScopeStatusReport[]): string[] {
    const registered = reports.filter((report) => report.registered);
    if (registered.length > 1) {
      const paths = registered.map((report) => report.configPath).join(" and ");
      return [`registered in both scopes (double-load risk): ${paths}`];
    }
    return [];
  }

  private effectiveVersion(reports: ScopeStatusReport[]): EffectiveVersion {
    const registeredScopes = reports.filter((report) => report.registered).map((report) => report.scope);
    for (const report of reports) {
      if (!report.registered) continue;
      return {
        version: report.resolved?.version ?? report.manifestVersion,
        source: report.resolved?.source ?? null,
        scope: report.scope,
        latestVersion: null,
        registeredScopes,
      };
    }
    return { version: null, source: null, scope: null, latestVersion: null, registeredScopes };
  }

  private async onlinePass(
    reports: ScopeStatusReport[],
    effective: EffectiveVersion,
  ): Promise<{ warnings: string[]; effective: EffectiveVersion }> {
    const warnings: string[] = [];
    const checker = new RegistryVersionChecker(this.fetchFn);
    const latest = new Map<string, string | null>();
    const failures = new Map<string, string>();
    for (const report of reports) {
      if (!report.registered || report.entryName === null || latest.has(report.entryName)) continue;
      const lookup = await checker.latest(report.entryName);
      if (lookup.warning !== null) {
        failures.set(report.entryName, lookup.warning);
        latest.set(report.entryName, null);
      } else {
        latest.set(report.entryName, lookup.version);
      }
    }
    for (const report of reports) {
      if (!report.registered || report.entryName === null) continue;
      const failure = failures.get(report.entryName);
      if (failure !== undefined) {
        warnings.push(`${report.scope}: ${failure}`);
        continue;
      }
      const published = latest.get(report.entryName) ?? null;
      const resolvedVersion = report.resolved?.version ?? null;
      if (published !== null && resolvedVersion !== null && published !== resolvedVersion) {
        warnings.push(`${report.scope}: resolves ${resolvedVersion} but npm publishes ${published} (stale)`);
      }
    }
    const effectiveReport = reports.find((report) => report.registered && report.scope === effective.scope);
    const effectiveName = effectiveReport?.entryName ?? null;
    const effectiveLatest = effectiveName !== null && !failures.has(effectiveName) ? latest.get(effectiveName) ?? null : null;
    return { warnings, effective: { ...effective, latestVersion: effectiveLatest } };
  }
}
