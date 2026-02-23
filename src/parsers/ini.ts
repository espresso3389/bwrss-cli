import type { FileParser } from "../types/index.ts";
import { filterByPatterns } from "../util/dotpath.ts";

/**
 * Parser for .env / INI-style KEY=VALUE files.
 * Preserves comments and empty lines on merge.
 */
export const iniParser: FileParser = {
  extensions: [".env"],

  parse(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  },

  extract(content: string, patterns: string[]): Record<string, string> {
    const all = this.parse(content);
    return filterByPatterns(all, patterns);
  },

  merge(existingContent: string, keys: Record<string, string>): string {
    const lines = existingContent.split("\n");
    const remaining = { ...keys };
    const result: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        result.push(line);
        continue;
      }
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        result.push(line);
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim();
      if (key in remaining) {
        result.push(`${key}=${remaining[key]}`);
        delete remaining[key];
      } else {
        result.push(line);
      }
    }

    // Append any new keys not found in the original
    for (const [key, value] of Object.entries(remaining)) {
      result.push(`${key}=${value}`);
    }

    return result.join("\n");
  },
};
