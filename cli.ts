#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { Installer, type Scope } from "./installer";

const VERSION = (JSON.parse(await Bun.file(`${import.meta.dirname}/package.json`).text()) as { version: string }).version;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    options: {
      scope: { type: "string", short: "s" },
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
  const installer = new Installer();

  try {
    switch (command) {
      case "install": {
        const outcome = await installer.install(scope, { force: values.force, projectDir: process.cwd() });
        if (outcome.action === "noop") {
          console.log(`Already installed at version ${VERSION}; nothing to do.`);
        } else {
          console.log(`${outcome.action === "installed" ? "Installed" : "Upgraded"} (${scope} scope):`);
          console.log(`  Agents:     ${outcome.agentsDir}`);
          console.log(`  References: ${outcome.referencesDir}`);
          console.log(`  Templates:  ${outcome.templatesDir}`);
        }
        if (outcome.pluginRemoved) {
          console.log("  Removed the plugin entry from opencode.json (switched to copy install).");
        }
        if (outcome.skipped.length > 0) {
          console.log("  Skipped locally modified files (re-run with --force to overwrite):");
          for (const file of outcome.skipped) console.log(`    ${file}`);
        }
        break;
      }
      case "uninstall": {
        const outcome = await installer.uninstall(scope, process.cwd());
        if (outcome.mode === "none") {
          console.log(`Nothing to uninstall for the ${scope} scope.`);
          break;
        }
        if (outcome.mode === "copy") {
          console.log(`Uninstalled (${scope} scope):`);
          for (const file of outcome.removed) console.log(`  Removed: ${file}`);
        }
        if (outcome.pluginRemoved) {
          console.log("  Removed the plugin entry from opencode.json.");
        }
        break;
      }
      case "status": {
        const outcome = await installer.status(scope, process.cwd());
        const version = outcome.version ?? "-";
        console.log(`${scope} scope: mode=${outcome.mode} version=${version}`);
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

Installs the opencode-architect agent suite by copying agents into the scope
base's agents/, references into opencode-architect/references/, and templates
into opencode-architect/templates/, rewriting relative reference paths to
absolute paths at install time. Copy install and plugin install are mutually
exclusive per scope.

Commands:
  install     Copy agents, references, and templates into the scope base
  uninstall   Remove exactly the files a copy install wrote (or the plugin entry)
  status      Show install mode and version for a scope

Options:
  -s, --scope <scope>    "local" (project .opencode/) or "global" (~/.config/opencode/); default local
  -f, --force            install: remove an existing plugin entry and overwrite locally modified files
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
