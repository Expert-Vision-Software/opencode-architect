import { homedir } from "node:os";
import path from "node:path";

export class NpmCache {
  public root(): string {
    const xdgCacheHome = process.env.XDG_CACHE_HOME;
    if (xdgCacheHome) return path.join(xdgCacheHome, "opencode", "npm");
    return path.join(homedir(), ".cache", "opencode", "npm");
  }

  public opencodeRoot(): string {
    return path.dirname(this.root());
  }
}
