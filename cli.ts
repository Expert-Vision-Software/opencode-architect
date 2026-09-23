#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { Installer, type Scope } from "./installer";

const VERSION = (JSON.parse(await Bun.file(`${import.meta.dirname}/package.json`).text()) as { version: string }).version;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    options: {
      scope: { type: "string", short: "s" },
      mode: { type: "string", short: "m" },
      force: { type: "boolean", short: "f", default: false },
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

Options:
  -s, --scope <scope>    "local" (project) or "global" (XDG/home config); default local
  -m, --mode <mode>      "plugin" (default) or "copy"; copy is refused for this
                         code-backed package
  -f, --force            re-register and rewrite the manifest even when it is up to date
  -h, --help             Show this help message
  -v, --version          Show version

Examples:
  opencode-architect install
  opencode-architect install --scope global
  opencode-architect uninstall
  opencode-architect status
`);
}

main();
