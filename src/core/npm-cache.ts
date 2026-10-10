import { homedir } from "node:os";
import path from "node:path";
import { realEnvironment, type Environment } from "./environment";

export class NpmCache {
  constructor(private readonly environment: Environment = realEnvironment) {}

  public root(): string {
    const xdgCacheHome = this.environment.env("XDG_CACHE_HOME");
    if (xdgCacheHome) return path.join(xdgCacheHome, "opencode", "npm");
    return path.join(homedir(), ".cache", "opencode", "npm");
  }

  public opencodeRoot(): string {
    return path.dirname(this.root());
  }
}
