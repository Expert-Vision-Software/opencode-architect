#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { Installer, type Scope } from "./installer";
import { CacheCleaner } from "./cache-cleaner";
import { ClearCacheUsageError } from "./clear-cache-usage-error";

const VERSION = (JSON.parse(await Bun.file(`${import.meta.dirname}/package.json`).text()) as { version: string }).version;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    options: {
      scope: { type: "string", short: "s" },
      mode: { type: "string", short: "m" },
      force: { type: "boolean", short: "f", default: false },
      package: { type: "string" },
      all: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.version) {
    console.log(`opencode-architect v${VERSION}`);
    return;
  }
  if (values.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const command = positionals[0];
  const scopeInput = values.scope;
  if (scopeInput !== undefined && scopeInput !== "local" && scopeInput !== "global") {
    console.error(`Invalid scope: ${scopeInput}. Must be "local" or "global".`);
    process.exit(1);
  }
  const scope: Scope = scopeInput === "global" ? "global" : "local";
  if (values.mode !== undefined && values.mode !== "plugin" && values.mode !== "copy") {
    console.error(`Invalid mode: ${values.mode}. Must be "plugin" or "copy".`);
    process.exit(1);
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
        break;
      }
      case "status": {
        const outcome = await installer.status(scope, process.cwd());
        const version = outcome.version ?? "-";
        const configPath = outcome.configPath ?? "-";
        console.log(`${scope} scope: mode=${outcome.mode} version=${version} config=${configPath}`);
        break;
      }
      case "clear-cache": {
        if (positionals.length > 1) {
          console.error(`Unexpected arguments for clear-cache: ${positionals.slice(1).join(" ")}`);
          process.exit(1);
        }
        let outcome;
        try {
          outcome = await new CacheCleaner().clear({ packageName: values.package ?? null, all: values.all, yes: values.yes, dryRun: values["dry-run"] });
        } catch (error) {
          if (error instanceof ClearCacheUsageError) {
            console.error(error.message);
            process.exit(1);
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
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
opencode-architect v${VERSION}

Registers the opencode-architect plugin in a config file's plugin array so the
agent suite loads from the package at startup. Nothing is copied: the plugin
registers the agents and resolves reference paths at load time.

Commands:
  install     Ensure the plugin entry and write the install manifest
  uninstall   Remove the plugin entry, the manifest, and any residual payload
  status      Show install mode, version, and the config file holding the entry
  clear-cache Remove cached copies from OpenCode's package cache; default
              targets this package only

Options:
  -s, --scope <scope>    "local" (project) or "global" (XDG/home config); default local
  -m, --mode <mode>      "plugin" (default) or "copy"; copy is refused for this
                         code-backed package
  -f, --force            re-register and rewrite the manifest even when it is up to date
      --package <name>   clear-cache: remove <name> and every <name>@* instead;
                         requires --yes
      --all              clear-cache: remove the whole OpenCode cache directory;
                         requires --yes
      --yes              clear-cache: confirm a destructive broad mode
      --dry-run          clear-cache: list what would be removed without deleting
  -h, --help             Show this help message
  -v, --version          Show version

Examples:
  opencode-architect install
  opencode-architect install --scope global
  opencode-architect uninstall
  opencode-architect status
  opencode-architect clear-cache
  opencode-architect clear-cache --package some-pkg --yes
  opencode-architect clear-cache --all --yes
  opencode-architect clear-cache --dry-run
`);
}

main();
