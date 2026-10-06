import { Schema } from "effect";
import { Config } from "@opencode/schema";

export interface SchemaVerdict {
  ok: boolean;
  config: Config.Info | null;
  issue: string | null;
}

const decodeConfig = Schema.decodeUnknownResult(Config.Info);

export class ConfigSchemaValidator {
  public validateValue(value: unknown): SchemaVerdict {
    const result = decodeConfig(value);
    if (result._tag === "Success") return { ok: true, config: result.success, issue: null };
    return { ok: false, config: null, issue: flattenIssue(result.failure) };
  }

  public validateText(text: string, lenient: boolean): SchemaVerdict {
    const parseable = lenient ? stripJsonc(text) : text;
    let parsed: unknown;
    try {
      parsed = JSON.parse(parseable);
    } catch (error) {
      return { ok: false, config: null, issue: `fixture is not parseable JSON: ${String(error)}` };
    }
    return this.validateValue(parsed);
  }
}

function stripJsonc(text: string): string {
  return blankComments(text).replace(/,(\s*[}\]])/g, "$1");
}function blankComments(text: string): string {
  const chars = text.split("");
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < chars.length; i++) {
    const current = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : "";
    if (inLineComment) {
      if (current === "\n") inLineComment = false;
      else chars[i] = " ";
      continue;
    }
    if (inBlockComment) {
      if (current === "*" && next === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        inBlockComment = false;
      } else {
        chars[i] = " ";
      }
      continue;
    }
    if (inString) {
      if (current === "\\") i++;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      continue;
    }
    if (current === "/" && next === "/") {
      chars[i] = " ";
      chars[i + 1] = " ";
      inLineComment = true;
      continue;
    }
    if (current === "/" && next === "*") {
      chars[i] = " ";
      chars[i + 1] = " ";
      inBlockComment = true;
    }
  }
  return chars.join("");
}

export function flattenIssue(failure: unknown): string {
  const issue = (failure as { issue?: unknown } | null)?.issue;
  const message = (issue as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.length > 0) return message;
  return JSON.stringify(failure).slice(0, 300);
}
