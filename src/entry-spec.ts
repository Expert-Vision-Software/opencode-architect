import { isAbsolute } from "node:path";

export type EntryForm = "npm" | "path";

export interface ClassifiedEntry {
  form: EntryForm;
  display: string;
  spec: string;
  name: string | null;
  version: string | null;
}

export class EntrySpec {
  public static classify(entry: unknown): ClassifiedEntry | null {
    const spec = EntrySpec.specOf(entry);
    if (spec === null) return null;
    const display = typeof entry === "string" ? entry : JSON.stringify(entry);
    if (EntrySpec.isPath(spec)) {
      return { form: "path", display, spec, name: null, version: null };
    }
    const parsed = EntrySpec.parseNpm(spec);
    if (parsed === null) return null;
    return { form: "npm", display, spec, name: parsed.name, version: parsed.version };
  }

  public static specOf(entry: unknown): string | null {
    if (typeof entry === "string") return entry.trim();
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      const spec = (entry as { package?: unknown }).package;
      if (typeof spec === "string") return spec.trim();
    }
    return null;
  }

  public static isPath(spec: string): boolean {
    if (spec.startsWith("file://")) return true;
    if (spec.startsWith(".")) return true;
    if (isAbsolute(spec)) return true;
    if (spec.includes("@")) return false;
    if (spec.includes("/") || spec.includes("\\")) return true;
    return false;
  }

  public static baseName(raw: string): string {
    const trimmed = raw.trim();
    const specIndex = trimmed.lastIndexOf("@");
    if (specIndex > 0) return trimmed.slice(0, specIndex);
    return trimmed;
  }

  private static parseNpm(spec: string): { name: string; version: string } | null {
    const at = spec.lastIndexOf("@");
    if (at <= 0) return { name: spec, version: "latest" };
    const version = spec.slice(at + 1);
    if (version.includes("/") || version.includes("\\")) return null;
    return { name: spec.slice(0, at), version: version.length === 0 ? "latest" : version };
  }
}
