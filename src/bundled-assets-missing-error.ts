export class BundledAssetsMissingError extends Error {
  constructor(missingPath: string, cacheRoot: string, version: string) {
    super(
      `Bundled asset directory missing or empty: ${missingPath}. ` +
        `The opencode-architect package cache at ${cacheRoot} is partial ` +
        `(expected opencode-architect@${version}). ` +
        `Clear it with: bunx opencode-architect clear-cache, then reinstall with: bunx opencode-architect install`,
    );
    this.name = "BundledAssetsMissingError";
  }
}
