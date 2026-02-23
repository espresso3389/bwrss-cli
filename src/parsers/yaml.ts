import YAML from "yaml";
import type { FileParser } from "../types/index.ts";
import { flatten, filterByPatterns, setPath } from "../util/dotpath.ts";

/**
 * Parser for YAML files with dot-path key support.
 * Uses the `yaml` library to preserve comments on round-trip.
 */
export const yamlParser: FileParser = {
  extensions: [".yaml", ".yml"],

  parse(content: string): Record<string, string> {
    const obj = YAML.parse(content);
    if (!obj || typeof obj !== "object") return {};
    return flatten(obj);
  },

  extract(content: string, patterns: string[]): Record<string, string> {
    const all = this.parse(content);
    return filterByPatterns(all, patterns);
  },

  merge(existingContent: string, keys: Record<string, string>): string {
    // Use YAML Document API for comment-preserving round-trip
    const doc = YAML.parseDocument(existingContent);
    for (const [path, value] of Object.entries(keys)) {
      doc.setIn(path.split("."), value);
    }
    return doc.toString();
  },
};
