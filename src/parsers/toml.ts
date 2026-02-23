import * as TOML from "smol-toml";
import type { FileParser } from "../types/index.ts";
import { flatten, unflatten, filterByPatterns } from "../util/dotpath.ts";

/**
 * Parser for TOML files with dot-path key support.
 */
export const tomlParser: FileParser = {
  extensions: [".toml"],

  parse(content: string): Record<string, string> {
    const obj = TOML.parse(content);
    return flatten(obj as Record<string, unknown>);
  },

  extract(content: string, patterns: string[]): Record<string, string> {
    const all = this.parse(content);
    return filterByPatterns(all, patterns);
  },

  merge(existingContent: string, keys: Record<string, string>): string {
    const obj = TOML.parse(existingContent) as Record<string, unknown>;
    // Apply keys back into the object
    const nested = unflatten(keys);
    deepMerge(obj, nested);
    return TOML.stringify(obj);
  },
};

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof target[key] === "object" &&
      target[key] !== null
    ) {
      deepMerge(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}
