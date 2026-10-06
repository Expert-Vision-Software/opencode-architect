import type { PermissionEvaluation } from "@opencode/plugin/effect/permission";

export class AssetPermissionAdvisor {
  private readonly assetsDir: string;

  public constructor(assetsDir: string) {
    this.assetsDir = assetsDir.replaceAll("\\", "/").replace(/\/+$/, "");
  }

  public evaluate(input: PermissionEvaluation): void {
    if (input.effect !== "ask") return;
    if (input.action !== "external_directory") return;
    if (!input.resources.every((resource) => this.isBundledResource(resource))) return;
    input.effect = "allow";
  }

  private isBundledResource(resource: string): boolean {
    const normalized = resource.replaceAll("\\", "/");
    return normalized === this.assetsDir || normalized.startsWith(`${this.assetsDir}/`);
  }
}
