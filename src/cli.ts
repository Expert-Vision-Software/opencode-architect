#!/usr/bin/env bun
import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { Installer, type Scope } from "./installer";
import { StatusReporter, type EffectiveVersion, type StatusReport } from "./status-reporter";
import type { ResolvedSource } from "./loaded-version";
import { CacheCleaner } from "./cache-cleaner";
import { ClearCacheUsageError } from "./clear-cache-usage-error";
import { Scaffolder } from "./scaffold/scaffolder";

const VERSION = (JSON.parse(await Bun.file(`${import.meta.dirname}/../package.json`).text()) as { version: string }).version;

export async function runCli(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      scope: { type: "string", short: "s" },
      mode: { type: "string", short: "m" },
      force: { type: "boolean", short: "f", default: false },
      package: { type: "string" },
      all: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      online: { type: "boolean", default: false },
      path: { type: "string" },
      name: { type: "string" },
      target: { type: "string" },
      ship: { type: "string" },
      promote: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.version) {
    console.log(`opencode-architect v${VERSION}`);
    return 0;
  }
  if (values.help || positionals.length === 0) {
    printHelp();
    return 0;
  }

  const command = positionals[0];
  if (command !== "status" && (values.path !== undefined || values.online)) {
    console.error("--path and --online only apply to the status command.");
    return 1;
  }
  if (command !== "scaffold" && (values.name !== undefined || values.target !== undefined || values.ship !== undefined || values.promote !== undefined)) {
    console.error("--name, --target, --ship, and --promote only apply to the scaffold command.");
    return 1;
  }
  if (command === "scaffold" && (values.scope !== undefined || values.mode !== undefined || values.package !== undefined || values.all || values.online || values.path !== undefined)) {
    console.error("--scope, --mode, --package, --all, --online, and --path do not apply to the scaffold command.");
    return 1;
  }
  if (command !== "status" && command !== "clear-cache" && values.package !== undefined) {
    console.error("--package only applies to the status and clear-cache commands.");
    return 1;
  }
  if (command === "status" && values.package !== undefined && !isSafeLookupName(values.package)) {
    console.error(`Invalid package name: ${values.package}`);
    return 1;
  }
  const scopeInput = values.scope;
  if (scopeInput !== undefined && scopeInput !== "local" && scopeInput !== "global") {
    console.error(`Invalid scope: ${scopeInput}. Must be "local" or "global".`);
    return 1;
  }
  const scope: Scope = scopeInput === "global" ? "global" : "local";
  if (values.mode !== undefined && values.mode !== "plugin" && values.mode !== "copy") {
    console.error(`Invalid mode: ${values.mode}. Must be "plugin" or "copy".`);
    return 1;
  }
  const mode: "plugin" | "copy" = values.mode === "copy" ? "copy" : "plugin";
  const installer = new Installer();

  try {
    switch (command) {
      case "install": {
        const outcome = await installer.install(scope, { force: values.force, mode, projectDir: process.cwd() });
        if (outcome.action === "noop") {
          console.log(`Already registered at version ${VERSION}; nothing to do.`);
        } else if (outcome.action === "migrated") {
          console.log("Migrated a legacy copy install to plugin registration.");
          for (const file of outcome.removedPayload) console.log(`  Removed: ${file}`);
        } else {
          console.log(`${outcome.action === "installed" ? "Registered" : "Updated registration"} (${scope} scope).`);
        }
        if (outcome.configPath !== null) {
          console.log(`  Plugin entry: ${outcome.configPath}`);
        }
        if (outcome.configWarning !== null) {
          console.warn(`  Warning: ${outcome.configWarning}`);
        }
        console.log(`  Manifest:     ${outcome.manifestPath}`);
        for (const cachePath of outcome.clearedCache) {
          console.log(`  Cleared cache: ${cachePath}`);
        }
        for (const warning of outcome.cacheWarnings) {
          console.warn(`  Warning: ${warning}`);
        }
        break;
      }
      case "uninstall": {
        const outcome = await installer.uninstall(scope, process.cwd());
        if (outcome.mode === "none") {
          console.log(`Nothing to uninstall for the ${scope} scope.`);
          break;
        }
        console.log(`Uninstalled (${scope} scope):`);
        for (const file of outcome.removed) console.log(`  Removed: ${file}`);
        if (outcome.pluginRemoved && outcome.configPath !== null) {
          console.log(`  Removed the plugin entry from ${outcome.configPath}.`);
        }
        if (outcome.configWarning !== null) {
          console.warn(`  Warning: ${outcome.configWarning}`);
        }
        break;
      }
      case "status": {
        const projectDir = await resolveProjectDir(values.path);
        const scopes: Scope[] | null = scopeInput === undefined ? null : [scope];
        const report = await new StatusReporter(installer).report(projectDir, {
          scopes,
          online: values.online,
          packageName: values.package,
        });
        printStatusReport(report);
        break;
      }
      case "clear-cache": {
        if (positionals.length > 1) {
          console.error(`Unexpected arguments for clear-cache: ${positionals.slice(1).join(" ")}`);
          return 1;
        }
        let outcome;
        try {
          outcome = await new CacheCleaner().clear({ packageName: values.package ?? null, all: values.all, yes: values.yes, dryRun: values["dry-run"] });
        } catch (error) {
          if (error instanceof ClearCacheUsageError) {
            console.error(error.message);
            return 1;
          }
          throw error;
        }
        if (outcome.removed.length === 0) {
          console.log("No cached copies found; nothing to remove.");
        } else if (outcome.dryRun) {
          console.log("Dry run; would remove:");
          for (const target of outcome.removed) console.log(`  Would remove: ${target}`);
        } else {
          console.log("Removed cached copies:");
          for (const target of outcome.removed) console.log(`  Removed: ${target}`);
        }
        for (const warning of outcome.warnings) {
          console.warn(`  Warning: ${warning}`);
        }
        break;
      }
      case "scaffold": {
        if (positionals.length > 1) {
          console.error(`Unexpected arguments for scaffold: ${positionals.slice(1).join(" ")}`);
          return 1;
        }
        const scaffolder = new Scaffolder();
        const outcome = await scaffolder.fresh({
          name: values.name ?? null,
          target: values.target ?? null,
          ship: values.ship ?? null,
          workspaceRoot: process.cwd(),
        });
        if (!outcome.ok) {
          console.error(outcome.error);
          return 1;
        }
        console.log(`Scaffolded ${outcome.packageName} at ${outcome.packageDir}`);
        for (const file of outcome.files) console.log(`  Wrote: ${file}`);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        return 1;
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}

function printStatusReport(report: StatusReport): void {
  console.log(`package: ${report.packageName}`);
  for (const scopeReport of report.scopes) {
    const entry = scopeReport.entryText ?? "-";
    const config = scopeReport.configPath ?? "-";
    const npm =
      scopeReport.publishedVersion !== null ? ` npm-latest=${scopeReport.publishedVersion}` : "";
    console.log(
      `${scopeReport.scope} scope: mode=${scopeReport.mode} config=${config} entry=${entry} resolved=${resolvedLabel(scopeReport.resolved)}${npm}`,
    );
    for (const warning of scopeReport.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
  if (report.effective.scope !== null) {
    console.log(`should load: ${verdictLabel(report.effective)}`);
  } else {
    console.log("should load: nothing (not registered in any scope)");
  }
  for (const warning of report.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

function resolvedLabel(source: ResolvedSource | null): string {
  if (source === null) return "-";
  const age = StatusReporter.formatAge(source.modifiedMs);
  const detail = age === null ? sourceLabel(source.source) : `${sourceLabel(source.source)}, ${age}`;
  return `${source.version ?? "unknown"} (${detail})`;
}

function verdictLabel(effective: EffectiveVersion): string {
  const latest =
    effective.latestVersion !== null && effective.versionKind !== "npm" ? `, latest ${effective.latestVersion}` : "";
  const scopeLabel =
    effective.registeredScopes.length > 1
      ? `${effective.registeredScopes.join(" + ")}; both scopes register — double-load`
      : effective.scope;
  return `${effective.version ?? "unknown"} (${kindLabel(effective.versionKind)}, ${scopeLabel}${latest})`;
}

function kindLabel(kind: EffectiveVersion["versionKind"]): string {
  if (kind === "cache") return "cache copy";
  if (kind === "checkout") return "checkout copy";
  if (kind === "spec") return "pinned spec";
  if (kind === "npm") return "npm latest";
  if (kind === "manifest") return "manifest";
  return "unresolved";
}

function sourceLabel(source: "cache" | "checkout"): string {
  return source === "cache" ? "cache copy" : "checkout copy";
}

async function resolveProjectDir(input: string | undefined): Promise<string> {
  if (input === undefined) return process.cwd();
  const cleaned = stripQuotes(input.trim());
  const resolved = path.resolve(cleaned);
  let info: Stats | null = null;
  try {
    info = await stat(resolved);
  } catch {
    throw new Error(`--path does not exist: ${input}`);
  }
  if (!info.isDirectory()) throw new Error(`--path is not a directory: ${input}`);
  return resolved;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function isSafeLookupName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !trimmed.split(/[\\/]/).includes("..");
}

function printHelp(): void {
  console.log(`
opencode-architect v${VERSION}

Registers the opencode-architect plugin in a config file's plugins array so the
agent suite loads from the package at startup. Nothing is copied: the plugin
registers the agents and resolves reference paths at load time. Legacy v1
"plugin" entries are detected and left read-only with an upgrade advisory.

Commands:
  install     Ensure the plugin entry and write the install manifest
  uninstall   Remove the plugin entry, the manifest, and any residual payload
  status      Resolve what a session would load: per-scope registration, the
              config file holding it, the raw entry, the resolved source on
              disk, and an effective verdict; --package resolves another
              installed package instead of this one
  clear-cache Remove cached copies from OpenCode's package cache; default
              targets this package only
  scaffold    Generate a conformant extension package from the bundled
              templates. Fresh mode (default) renders a new package tree;
              --promote takes existing .opencode/ extensions into a package,
              ensures the config reference, verifies the payload, and retires
              the sources only on explicit consent

Options:
  -s, --scope <scope>    status: narrow to "local" or "global"; by default both
                         scopes are resolved. install/uninstall: default local
  -m, --mode <mode>      "plugin" (default) or "copy"; copy is refused for this
                         code-backed package
  -f, --force            re-register and rewrite the manifest even when it is up to date;
                         consent to migrating a legacy copy install (removes its copied payload)
      --online           status: also query the npm registry for the latest published
                         version and flag staleness; network failures warn and continue
      --path <dir>       status: resolve against another project directory instead of
                         the current working directory; the directory must exist
      --package <name>   status: resolve <name> instead of this package, so another
                         installed package can be inspected; also selects the
                         <name>.manifest.json lookup. clear-cache: remove <name> and
                         every <name>@* instead; requires --yes
      --all              clear-cache: remove the whole OpenCode cache directory;
                         requires --yes
      --name <name>      scaffold: the package name, opencode-<name>
      --target <target>  scaffold: "here" (default) or "sibling" deployment
      --ship <kinds>     scaffold: comma-separated list of skills, commands,
                         agents, tools, plugins; default skills
      --promote <path>   scaffold: promote existing .opencode/ extensions (or
                         the .opencode/ at <path>) into a package; retirement
                         of the originals requires --yes
      --yes              scaffold --promote: consent to deleting the promoted
                         originals after the payload verifies
      --yes              clear-cache: confirm a destructive broad mode
      --dry-run          clear-cache: list what would be removed without deleting
  -h, --help             Show this help message
  -v, --version          Show version

Examples:
  opencode-architect install
  opencode-architect install --scope global
  opencode-architect uninstall
  opencode-architect status
  opencode-architect status --scope global
  opencode-architect status --online
  opencode-architect status --path ../other-project
  opencode-architect status --online --path ../other-project --package some-pkg
  opencode-architect clear-cache
  opencode-architect clear-cache --package some-pkg --yes
  opencode-architect clear-cache --all --yes
  opencode-architect clear-cache --dry-run
  opencode-architect scaffold --name opencode-myextension
  opencode-architect scaffold --name opencode-myextension --target sibling --ship skills,commands
  opencode-architect scaffold --promote --yes
`);
}

