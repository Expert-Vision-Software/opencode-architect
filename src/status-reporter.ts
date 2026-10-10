import { PACKAGE_NAME } from "./cache-cleaner";
import path from "node:path";
import { ConfigEntriesReader, type ConfigEntries } from "./config-entries";
import { LoadedVersionResolver, type ResolvedSource } from "./loaded-version";
import { RegistryVersionChecker } from "./registry-version-checker";
import { EntryPredicate } from "./entry-predicate";
import type { InstallMode, Scope } from "./installer";

export interface ManifestState {
  mode: InstallMode;
  version: string;
}

export interface ManifestLookup {
  manifestAt(scope: Scope, projectDir: string, packageName?: string): Promise<ManifestState | null>;
}

export interface ScopeStatusReport {
  scope: Scope;
  registered: boolean;
  mode: InstallMode;
  manifestVersion: string | null;
  configPath: string | null;
  entryText: string | null;
  entryName: string | null;
  entryVersion: string | null;
  entryForm: "npm" | "path" | null;
  resolved: ResolvedSource | null;
  publishedVersion: string | null;
  warnings: string[];
}

export type VersionKind = "cache" | "checkout" | "spec" | "npm" | "manifest" | null;

export interface EffectiveVersion {
  version: string | null;
  versionKind: VersionKind;
  scope: Scope | null;
  latestVersion: string | null;
  registeredScopes: Scope[];
}

export interface StatusReport {
  projectDir: string;
  packageName: string;
  scopes: ScopeStatusReport[];
  effective: EffectiveVersion;
  warnings: string[];
}

export interface StatusReportOptions {
  scopes: Scope[] | null;
  online: boolean;
  packageName?: string;
}

interface MatchedEntry {
  configPath: string;
  entry: unknown;
  display: string;
  name: string | null;
  version: string | null;
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
    const packageName = options.packageName ?? PACKAGE_NAME;
    let reports: ScopeStatusReport[] = [];
    for (const scope of scopes) {
      reports.push(await this.resolveScope(scope, projectDir, packageName));
    }
    const warnings = this.crossScopeWarnings(reports);
    if (options.online) {
      const online = await this.onlinePass(reports);
      warnings.push(...online.warnings);
      reports = online.reports;
    }
    const effective = this.effectiveVersion(reports);
    return { projectDir, packageName, scopes: reports, effective, warnings };
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

  private async resolveScope(scope: Scope, projectDir: string, packageName: string): Promise<ScopeStatusReport> {
    const warnings: string[] = [];
    const entries = await this.entries.read(scope, projectDir, false);
    for (const candidate of entries) {
      if (candidate.parseError !== null) warnings.push(candidate.parseError);
    }
    const manifestState = await this.manifests.manifestAt(scope, projectDir, packageName);
    const matched = await this.findMatchedEntry(entries, packageName);
    if (matched === null) {
      return {
        scope,
        registered: false,
        mode: manifestState?.mode ?? "none",
        manifestVersion: manifestState?.version ?? null,
        configPath: null,
        entryText: null,
        entryName: null,
        entryVersion: null,
        entryForm: null,
        resolved: null,
        publishedVersion: null,
        warnings,
      };
    }
    const resolution = await this.resolver.resolve(matched.entry, path.dirname(matched.configPath));
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
      entryVersion: matched.version,
      entryForm: matched.form,
      resolved,
      publishedVersion: null,
      warnings,
    };
  }

  private async findMatchedEntry(entries: ConfigEntries[], packageName: string): Promise<MatchedEntry | null> {
    for (const candidate of entries) {
      for (const raw of candidate.rawEntries) {
        const classified = await EntryPredicate.matched(raw, packageName, path.dirname(candidate.configPath));
        if (classified === null) continue;
        return {
          configPath: candidate.configPath,
          entry: raw,
          display: classified.display,
          name: classified.name,
          version: classified.version,
          form: classified.form,
        };
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
      const fallback = this.specFallback(report);
      if (report.resolved !== null) {
        return {
          version: report.resolved.version,
          versionKind: report.resolved.source,
          scope: report.scope,
          latestVersion: report.publishedVersion,
          registeredScopes,
        };
      }
      if (fallback !== null) {
        return {
          version: fallback.version,
          versionKind: fallback.kind,
          scope: report.scope,
          latestVersion: report.publishedVersion,
          registeredScopes,
        };
      }
      return {
        version: report.manifestVersion,
        versionKind: report.manifestVersion !== null ? "manifest" : null,
        scope: report.scope,
        latestVersion: report.publishedVersion,
        registeredScopes,
      };
    }
    return { version: null, versionKind: null, scope: null, latestVersion: null, registeredScopes };
  }

  private specFallback(report: ScopeStatusReport): { version: string; kind: "spec" | "npm" } | null {
    if (report.entryVersion === null || report.entryVersion === "latest") {
      if (report.entryVersion === "latest" && report.publishedVersion !== null) {
        return { version: report.publishedVersion, kind: "npm" };
      }
      return null;
    }
    if (isExactSemver(report.entryVersion)) return { version: report.entryVersion, kind: "spec" };
    return null;
  }

  private async onlinePass(reports: ScopeStatusReport[]): Promise<{ warnings: string[]; reports: ScopeStatusReport[] }> {
    const warnings: string[] = [];
    const checker = new RegistryVersionChecker(this.fetchFn);
    const latest = new Map<string, string | null>();
    const failures = new Map<string, string>();
    for (const report of reports) {
      const name = this.lookupName(report);
      if (name === null || latest.has(name)) continue;
      const lookup = await checker.latest(name);
      if (lookup.warning !== null) {
        failures.set(name, lookup.warning);
        latest.set(name, null);
      } else {
        latest.set(name, lookup.version);
      }
    }
    const updated: ScopeStatusReport[] = [];
    for (const report of reports) {
      const name = this.lookupName(report);
      const published = name !== null ? latest.get(name) ?? null : null;
      if (name !== null) {
        const failure = failures.get(name);
        if (failure !== undefined) {
          warnings.push(`${report.scope}: ${failure}`);
        } else if (published !== null && report.resolved?.version != null && published !== report.resolved.version) {
          warnings.push(`${report.scope}: resolves ${report.resolved.version} but npm publishes ${published} (stale)`);
        }
      }
      updated.push({ ...report, publishedVersion: published });
    }
    return { warnings, reports: updated };
  }

  private lookupName(report: ScopeStatusReport): string | null {
    if (!report.registered) return null;
    if (report.entryName !== null) return report.entryName;
    return report.resolved?.name ?? null;
  }
}

function isExactSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version);
}
