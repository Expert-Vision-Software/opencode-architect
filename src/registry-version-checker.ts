export interface RegistryLookup {
  version: string | null;
  warning: string | null;
}

export class RegistryVersionChecker {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  public async latest(name: string, timeoutMs: number = 3000): Promise<RegistryLookup> {
    const url = `https://registry.npmjs.org/${name}/latest`;
    try {
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        return { version: null, warning: `npm registry returned ${response.status} for ${name}` };
      }
      const parsed = (await response.json()) as { version?: unknown };
      if (typeof parsed.version !== "string") {
        return { version: null, warning: `npm registry response for ${name} carried no version` };
      }
      return { version: parsed.version, warning: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { version: null, warning: `could not query npm registry for ${name}: ${message}` };
    }
  }
}
