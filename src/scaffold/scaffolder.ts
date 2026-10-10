import { exists, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ScaffoldRenderer, architectPackageRoot, fileDependency, type RenderedFile, type ShipKind } from "./renderer";

const SHIP_KINDS: ShipKind[] = ["skills", "commands", "agents", "tools", "plugins"];

export interface FreshOptions {
  name: string | null;
  target: string | null;
  ship: string | null;
  workspaceRoot: string;
}

export type FreshOutcome =
  | {
      ok: true;
      packageName: string;
      packageDir: string;
      files: string[];
    }
  | { ok: false; error: string };

export class Scaffolder {
  public async fresh(options: FreshOptions): Promise<FreshOutcome> {
    const name = options.name ?? this.askName();
    if (name === null || !/^opencode-[a-z0-9][a-z0-9-._]*$/.test(name)) {
      return { ok: false, error: `Invalid or missing package name: ${name ?? "(none)"}. Pass --name opencode-<name>.` };
    }
    const target = options.target ?? "here";
    if (target !== "here" && target !== "sibling") {
      return { ok: false, error: `Invalid target: ${target}. Must be "here" or "sibling".` };
    }
    const ship = this.parseShip(options.ship);
    if (typeof ship === "string") return { ok: false, error: ship };

    const packageDir =
      target === "sibling" ? path.join(path.dirname(options.workspaceRoot), name) : path.join(options.workspaceRoot, name);
    if (await exists(packageDir)) {
      return { ok: false, error: `Target directory already exists: ${packageDir}. Remove it or choose another name.` };
    }

    const rendered = new ScaffoldRenderer().render({
      name,
      ship,
      coreDependency: fileDependency(packageDir, architectPackageRoot()),
    });
    for (const file of rendered) {
      const targetPath = path.join(packageDir, file.relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content);
    }
    return {
      ok: true,
      packageName: name,
      packageDir,
      files: rendered.map((file) => file.relativePath),
    };
  }

  public writeRendered(packageDir: string, rendered: RenderedFile[]): Promise<void> {
    return Promise.all(
      rendered.map(async (file) => {
        const targetPath = path.join(packageDir, file.relativePath);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, file.content);
      }),
    ).then(() => undefined);
  }

  private parseShip(input: string | null): ShipKind[] | string {
    if (input === null) return ["skills"];
    const kinds = input
      .split(",")
      .map((kind) => kind.trim())
      .filter((kind) => kind.length > 0);
    if (kinds.length === 0) return ["skills"];
    for (const kind of kinds) {
      if (!SHIP_KINDS.includes(kind as ShipKind)) {
        return `Invalid ship kind: ${kind}. Must be a comma-separated list of ${SHIP_KINDS.join(", ")}.`;
      }
    }
    return kinds as ShipKind[];
  }

  private askName(): string | null {
    if (!process.stdout.isTTY) return null;
    const answer = prompt("Package name (opencode-<name>):");
    return answer === null || answer.trim().length === 0 ? null : answer.trim();
  }
}
