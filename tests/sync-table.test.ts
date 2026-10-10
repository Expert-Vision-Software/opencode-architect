import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ScaffoldRenderer, fileDependency, type ShipKind } from "../src/scaffold/renderer";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");
const TABLE_DOC = path.join(REPO_ROOT, "references", "template-sync-table.md");

const TEMPLATE_SEPARATOR = "---";

function templateBody(source: string): string {
  const separator = source.match(/^---$/m);
  if (separator === null || separator.index === undefined) return source;
  return source.slice(separator.index + TEMPLATE_SEPARATOR.length + 1).trimStart();
}

async function readTemplate(name: string): Promise<string> {
  return templateBody(await readFile(path.join(TEMPLATES_DIR, name), "utf-8"));
}

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.join(REPO_ROOT, relativePath), "utf-8");
}

type SyncState = "byte-synced" | "declared-divergent" | "fixture-covered";

interface SyncPair {
  template: string;
  /** Suite-side counterpart path (byte-synced, declared-divergent) or the rendered target the fixture exercises (fixture-covered). */
  counterpart: string;
  state: SyncState;
  /** For declared-divergent rows: the policy difference the tests assert. */
  policy?: string;
}

/**
 * The sync table: the one classification of every mirrored template↔suite pair.
 * Mirrored into references/template-sync-table.md — the test below fails when
 * the doc and this table disagree, so "are we in sync?" has a single answer.
 *
 * Since the core carve-out (ADR-0013) the machinery templates are gone: the
 * generated package imports the machinery from the `opencode-architect/core`
 * dependency, and what remains are adapter renderings the scaffold renderer
 * emits.
 */
const SYNC_TABLE: SyncPair[] = [
  // --- byte-synced: the test asserts source === template body ---
  { template: "index.template.txt", counterpart: "index.ts", state: "byte-synced" },

  // --- declared-divergent: the test asserts the named policy difference ---
  {
    template: "cli.template.txt",
    counterpart: "src/cli.ts",
    state: "declared-divergent",
    policy:
      "suite-only broad clear-cache modes (--package/--all/--yes/--dry-run) and status --package lookup; generated-only migrate subcommand; both are thin adapters over the core dependency",
  },
  {
    template: "installer.template.txt",
    counterpart: "src/installer.ts",
    state: "declared-divergent",
    policy:
      "suite installer is an Installer class orchestrating the suite payload; the generated installer is a function-style adapter whose policy constants (package, skill, command, asset layout) sit over the core dependency",
  },
  {
    template: "package-full.template.json",
    counterpart: "templates/package-basics.template.json",
    state: "declared-divergent",
    policy:
      "publisher-only npm-field expansion of package-basics (repository, publisher, author, bugs, license); the content declaration and exports carry through unchanged",
  },

  // --- fixture-covered: the rendered fixture (tests/templates.test.ts) exercises the file ---
  { template: "plugin-local.template.txt", counterpart: "src/plugin.ts", state: "fixture-covered" },
  { template: "skill-structure.template.md", counterpart: "skills/<identifier>/SKILL.md", state: "fixture-covered" },
  { template: "package-basics.template.json", counterpart: "package.json", state: "fixture-covered" },
  { template: "tsconfig.template.json", counterpart: "tsconfig.json", state: "fixture-covered" },
];

/** Machinery that used to be vendored through templates and now comes from the core dependency (ADR-0013). */
const CORE_PROVIDED = [
  { template: "plugin-name.template.txt", formerTarget: "src/plugin-name.ts" },
  { template: "plugin-entry.template.txt", formerTarget: "src/plugin-entry.ts" },
  { template: "entry-predicate.template.txt", formerTarget: "src/entry-predicate.ts" },
  { template: "manifest.template.txt", formerTarget: "src/manifest.ts" },
  { template: "registration.template.txt", formerTarget: "src/registration.ts" },
  { template: "plugin-config.template.txt", formerTarget: "src/plugin-config.ts" },
] as const;

const RENDER_PLAN = {
  name: "opencode-myextension",
  ship: ["skills", "commands"] as ShipKind[],
  coreDependency: fileDependency(
    path.join(REPO_ROOT, ".rendered-fixture", "opencode-myextension"),
    REPO_ROOT,
  ),
};

describe("template sync table", () => {
  describe("byte-synced pairs are byte-identical", () => {
    for (const pair of SYNC_TABLE.filter((row) => row.state === "byte-synced")) {
      test(`templates/${pair.template} === ${pair.counterpart}`, async () => {
        const [body, source] = await Promise.all([readTemplate(pair.template), readSource(pair.counterpart)]);
        expect(source).toBe(body);
      });
    }
  });

  describe("declared-divergent pairs diverge exactly as the policy names", () => {
    test("cli: suite-only broad clear-cache and status --package lookup; generated-only migrate", async () => {
      const [suite, generated] = await Promise.all([
        readSource("src/cli.ts"),
        readTemplate("cli.template.txt"),
      ]);
      // Suite-only: broad clear-cache modes and the status --package lookup.
      expect(suite).toContain("values.all");
      expect(suite).toContain(`values["dry-run"]`);
      expect(suite).toContain("values.package");
      // Generated-only: the consent-gated migrate subcommand.
      expect(generated).toContain(`case "migrate"`);
      expect(suite).not.toContain(`case "migrate"`);
      // Generated clear-cache stays self-only: no broad flags reach its parser.
      expect(generated).not.toContain("values.all");
      expect(generated).not.toContain(`values["dry-run"]`);
    });

    test("installer: suite is an Installer class, generated is an adapter over the core dependency", async () => {
      const [suite, generated] = await Promise.all([
        readSource("src/installer.ts"),
        readTemplate("installer.template.txt"),
      ]);
      expect(suite).toContain("export class Installer");
      expect(generated).not.toContain("class Installer");
      expect(generated).toContain("export async function install(");
      expect(generated).toContain("export async function uninstall(");
      // The adapter declares policy and delegates machinery to the core dependency.
      expect(generated).toContain('from "opencode-architect/core"');
      expect(generated).not.toContain("class InstallManifest");
      expect(generated).not.toContain("class PluginConfigEditor");
    });

    test("package-full expands package-basics with npm fields, carrying the declaration through", async () => {
      const [basics, full] = await Promise.all([
        readTemplate("package-basics.template.json"),
        readTemplate("package-full.template.json"),
      ]);
      expect(basics).not.toContain('"repository"');
      for (const npmField of ['"repository"', '"bugs"', '"license"', '"author"']) {
        expect(full).toContain(npmField);
      }
      // The declaration and exports carry through unchanged.
      for (const carried of ['"content": "assets"', '"./server": "./index.ts"', '"@opencode/plugin": "latest"']) {
        expect(basics).toContain(carried);
        expect(full).toContain(carried);
      }
    });
  });

  describe("fixture-covered pairs are exercised by the rendered fixture", () => {
    const rendered = new ScaffoldRenderer().render(RENDER_PLAN);

    for (const pair of SYNC_TABLE.filter((row) => row.state === "fixture-covered")) {
      test(`the scaffold renderer emits ${pair.counterpart} from templates/${pair.template}`, () => {
        const targets = rendered.map((file) => file.relativePath);
        // `<identifier>` rows render with the plan's identifier substituted.
        expect(targets).toContain(pair.counterpart.replaceAll("<identifier>", "myextension"));
      });
    }
  });

  describe("machinery pairs dissolved into the core dependency (ADR-0013)", () => {
    const rendered = new ScaffoldRenderer().render(RENDER_PLAN);

    for (const row of CORE_PROVIDED) {
      test(`templates/${row.template} no longer exists and ${row.formerTarget} is not rendered`, async () => {
        await expect(readFile(path.join(TEMPLATES_DIR, row.template), "utf-8")).rejects.toThrow();
        expect(rendered.map((file) => file.relativePath)).not.toContain(row.formerTarget);
      });
    }

    test("the rendered package.json depends on opencode-architect through a local file spec", () => {
      const manifest = JSON.parse(
        rendered.find((file) => file.relativePath === "package.json")?.content ?? "{}",
      ) as { dependencies: Record<string, string> };
      expect(manifest.dependencies["opencode-architect"]).toMatch(/^file:(\.\/|\.\.\/)/);
    });
  });

  test("references/template-sync-table.md mirrors this table", async () => {
    const doc = await readFile(TABLE_DOC, "utf-8");
    for (const pair of SYNC_TABLE) {
      const rowLines = doc.split("\n").filter((line) => line.includes(`\`${pair.template}\``));
      expect(rowLines.length, `the doc must have a row for ${pair.template}`).toBeGreaterThan(0);
      const row = rowLines.join("\n");
      expect(row).toContain(pair.counterpart);
      expect(row).toContain(pair.state);
    }
    // The doc names every template in the templates/ directory — nothing
    // unclassified: the dissolved rows appear in the core-provided section.
    for (const row of CORE_PROVIDED) {
      expect(doc).toContain(row.template);
    }
    expect(doc).toContain("prompts.template.txt");
  });
});
