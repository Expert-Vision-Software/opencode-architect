/**
 * The core module (ADR-0013): the machinery both the suite CLI and the
 * generated-package CLI share, exported through the `./core` subpath.
 * Policy lives in the adapters; the invariants live here — semantic entry
 * matching, manifest-gated idempotency, surgical config edits, hooks that
 * never throw (ADR-0006, ADR-0007).
 */

// environment adapter + scope bases + cache paths
export { realEnvironment, type Environment, type EnvLookup, type WarnChannel } from "./environment";
export { scopeBase, type Scope } from "./scope-base";
export { NpmCache } from "./npm-cache";
export { removeCacheTargets, type CacheOutcome } from "./cache-hygiene";

// name matching and entry classification
export { PluginNameNormalizer } from "./plugin-name";
export { PluginEntryResolver } from "./plugin-entry";
export { EntryPredicate, type ClassifiedEntry, type EntryForm } from "./entry-predicate";

// config reading, detection, and surgical splicing
export {
  ConfigReader,
  type CandidateConfig,
  type CandidateRead,
  type ConfigEntries,
  type ConfigScope,
  type EnsurePluginEntryOptions,
  type PluginConfigKey,
} from "./config-reader";
export { RegistrationDetector } from "./registration-detector";
export { ConfigSplicer } from "./config-splicer";
export {
  PluginConfigEditor,
  type ConfigCheck,
  type EnsurePluginEntryOutcome,
  type RemovePluginEntryOutcome,
} from "./plugin-config";

// manifest io + per-file hashes (generated-package format, frozen per ADR-0013)
export {
  InstallManifest,
  listFilesRecursive,
  manifestPath,
  sha256,
  type InstallMode,
  type ManifestData,
  type ManifestWrite,
} from "./manifest";

// effective-version pipeline
export { LoadedVersionResolver, type EntryResolution, type ResolvedSource } from "./loaded-version";
export { RegistryVersionChecker, type RegistryLookup } from "./registry-version-checker";
export {
  StatusReporter,
  type DeploymentMode,
  type EffectiveVersion,
  type ManifestLookup,
  type ScopeStatusReport,
  type StatusReport,
  type StatusReportOptions,
  type VersionKind,
} from "./status-reporter";
