import type { FileParser } from "../types/index.ts";
import { flatten, filterByPatterns, setPath } from "../util/dotpath.ts";

/**
 * Parser for JSON files with dot-path key support.
 */
export const jsonParser: FileParser = {
  extensions: [".json"],

  parse(content: string): Record<string, string> {
    const obj = JSON.parse(content);
    return flatten(obj);
  },

  extract(content: string, patterns: string[]): Record<string, string> {
    const all = this.parse(content);
    return filterByPatterns(all, patterns);
  },

  merge(existingContent: string, keys: Record<string, string>): string {
    const obj = JSON.parse(existingContent);
    for (const [path, value] of Object.entries(keys)) {
      setPath(obj, path, value);
    }
    // Detect indent from original
    const indent = detectJsonIndent(existingContent);
    return JSON.stringify(obj, null, indent) + "\n";
  },
};

function detectJsonIndent(content: string): number {
  const match = content.match(/^[\s]*[^\s]/m);
  if (match) {
    const spaces = match[0].length - 1;
    if (spaces > 0) return spaces;
  }
  return 2;
}
