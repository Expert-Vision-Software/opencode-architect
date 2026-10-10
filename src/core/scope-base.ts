import { homedir } from "node:os";
import path from "node:path";
import { realEnvironment, type Environment } from "./environment";

export type Scope = "local" | "global";

export function scopeBase(
  scope: "local" | "global",
  projectDir: string,
  environment: Environment = realEnvironment,
): string {
  if (scope === "local") return path.join(projectDir, ".opencode");
  const xdgConfigHome = environment.env("XDG_CONFIG_HOME");
  if (xdgConfigHome) return path.join(xdgConfigHome, "opencode");
  return path.join(homedir(), ".config", "opencode");
}
