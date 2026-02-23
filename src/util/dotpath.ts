import { getProperty, setProperty } from "dot-prop";

/**
 * Flatten a nested object into dot-path keys.
 * e.g. { a: { b: 1, c: 2 } } => { "a.b": "1", "a.c": "2" }
 */
export function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, path));
    } else {
      result[path] = String(value);
    }
  }
  return result;
}

/**
 * Unflatten a dot-path keyed object back into nested structure.
 * e.g. { "a.b": "1" } => { a: { b: "1" } }
 */
export function unflatten(flat: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    setProperty(result, path, value);
  }
  return result;
}

/**
 * Match a dot-path key against a glob pattern.
 * Supports `*` (match any single segment) and trailing `*` (match rest).
 * e.g. "db.*" matches "db.password", "db.host"
 * e.g. "API_*" matches "API_KEY", "API_SECRET"
 */
export function matchGlob(key: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = "^" + pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "\u0000") // placeholder for **
    .replace(/\*/g, "[^.]*")
    .replace(/\u0000/g, ".*")
  + "$";
  return new RegExp(regexStr).test(key);
}

/**
 * Filter keys by glob patterns. Returns matching key-value pairs.
 */
export function filterByPatterns(
  data: Record<string, string>,
  patterns: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (patterns.some((p) => matchGlob(key, p))) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Get a value at a dot-path from a nested object.
 */
export function getPath(obj: Record<string, unknown>, path: string): unknown {
  return getProperty(obj, path);
}

/**
 * Set a value at a dot-path in a nested object.
 */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  setProperty(obj, path, value);
}
