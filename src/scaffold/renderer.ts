import { readFileSync } from "node:fs";
import path from "node:path";

export type ShipKind = "skills" | "commands" | "agents" | "tools" | "plugins";

export interface ScaffoldPlan {
  name: string;
  ship: ShipKind[];
}

export interface RenderedFile {
  relativePath: string;
  content: string;
}

const TEMPLATES_DIR = path.join(import.meta.dirname, "..", "..", "templates");

const ASSET_KINDS: ShipKind[] = ["skills", "commands"];

const TEMPLATE_SOURCES: Array<{ template: string; target: string }> = [
  { template: "index.template.txt", target: "index.ts" },
  { template: "plugin-local.template.txt", target: "src/plugin.ts" },
  { template: "plugin-name.template.txt", target: "src/plugin-name.ts" },
  { template: "manifest.template.txt", target: "src/manifest.ts" },
  { template: "registration.template.txt", target: "src/registration.ts" },
  { template: "plugin-config.template.txt", target: "src/plugin-config.ts" },
  { template: "plugin-entry.template.txt", target: "src/plugin-entry.ts" },
  { template: "installer.template.txt", target: "src/installer.ts" },
  { template: "cli.template.txt", target: "src/cli.ts" },
];

export class ScaffoldRenderer {
  public render(plan: ScaffoldPlan): RenderedFile[] {
    const identifier = plan.name.replace(/^opencode-/, "");
    const substituted = (templateName: string): string =>
      ScaffoldRenderer.substitute(ScaffoldRenderer.templateBody(templateName), plan.name, identifier);

    const files: RenderedFile[] = TEMPLATE_SOURCES.map((entry) => ({
      relativePath: entry.target,
      content: substituted(entry.template),
    }));

    files.push({ relativePath: "tsconfig.json", content: substituted("tsconfig.template.json") });
    files.push({
      relativePath: `skills/${identifier}/SKILL.md`,
      content: substituted("skill-structure.template.md"),
    });
    files.push({
      relativePath: "commands/my-command.md",
      content: `---\ndescription: "Rendered command stub"\n---\n\nSay hello from ${plan.name}.\n`,
    });
    for (const kind of ["agents", "tools", "plugins"] as ShipKind[]) {
      if (plan.ship.includes(kind)) files.push({ relativePath: `${kind}/.gitkeep`, content: "" });
    }
    files.push({
      relativePath: "tests/plugin.contract.test.ts",
      content: ScaffoldRenderer.smokeTest(plan.name),
    });
    files.push({ relativePath: "package.json", content: this.manifest(plan, identifier) });
    return files;
  }

  private manifest(plan: ScaffoldPlan, identifier: string): string {
    const parsed = JSON.parse(ScaffoldRenderer.templateBody("package-basics.template.json")) as Record<string, unknown>;
    parsed["name"] = plan.name;
    parsed["bin"] = { [plan.name]: "src/cli.ts" };
    parsed["files"] = ["index.ts", "src", ...ScaffoldRenderer.shippedDirs(plan)];
    const shipped = new Set(plan.ship);
    const codeBacked = [...shipped].some((kind) => !ASSET_KINDS.includes(kind));
    parsed["content"] = codeBacked ? "code" : "assets";
    return `${JSON.stringify(parsed, null, 2)}\n`;
  }

  private static shippedDirs(plan: ScaffoldPlan): string[] {
    const dirs: string[] = ["skills", "commands"];
    for (const kind of ["agents", "plugins", "tools"] as ShipKind[]) {
      if (plan.ship.includes(kind)) dirs.push(kind);
    }
    return dirs;
  }

  private static smokeTest(name: string): string {
    return `import { describe, expect, test } from "bun:test";
import plugin from "../index.ts";

describe("${name}", () => {
  test("exports a v2 Effect plugin definition", () => {
    const definition = plugin as { id: string; effect: unknown };
    expect(definition.id).toBe("${name}");
    expect(typeof definition.effect).toBe("function");
  });
});
`;
  }

  private static substitute(body: string, name: string, identifier: string): string {
    return body.replaceAll("opencode-myextension", name).replaceAll("myextension", identifier);
  }

  private static templateBody(templateName: string): string {
    const source = readFileSync(path.join(TEMPLATES_DIR, templateName), "utf-8");
    const separator = source.match(/^---$/m);
    if (separator === null || separator.index === undefined) return source;
    return source.slice(separator.index + 3 + 1).trimStart();
  }
}
