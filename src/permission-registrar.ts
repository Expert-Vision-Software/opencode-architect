import path from "node:path";
import type { Config } from "@opencode-ai/plugin";

type PermissionAction = "ask" | "allow" | "deny";
type ExternalDirectoryRules = Record<string, PermissionAction>;

export class AssetPermissionRegistrar {
  private readonly assetsDir: string;

  public constructor(assetsDir: string) {
    this.assetsDir = assetsDir;
  }

  public register(config: Config): void {
    const permission = this.readPermission(config);
    const rules = this.readExternalDirectoryRules(permission.external_directory);
    if (rules["*"] === "deny") return;
    permission.external_directory = { ...rules, [this.assetPattern()]: "allow" };
    config.permission = permission as Config["permission"];
  }

  private readPermission(config: Config): Record<string, unknown> {
    if (config.permission === undefined) return {};
    return config.permission as Record<string, unknown>;
  }

  private readExternalDirectoryRules(value: unknown): ExternalDirectoryRules {
    if (value === undefined) return {};
    if (typeof value === "string") return { "*": value as PermissionAction };
    return { ...(value as ExternalDirectoryRules) };
  }

  private assetPattern(): string {
    return path.join(this.assetsDir, "*").replaceAll("\\", "/");
  }
}
