import { homedir } from "node:os";
import { resolve } from "node:path";
import { readdir, access } from "node:fs/promises";
import type { ManagedFile } from "../types/index.ts";

interface HomePattern {
  path: string;
  machine: boolean;
  /** If true, expand glob-like pattern (e.g. .ssh/id_*) */
  glob?: boolean;
}

const HOME_PATTERNS: HomePattern[] = [
  // SSH
  { path: ".ssh/id_*", machine: true, glob: true },
  { path: ".ssh/config", machine: false },

  // AWS
  { path: ".aws/credentials", machine: true },
  { path: ".aws/config", machine: false },

  // GitHub CLI (contains OAuth tokens)
  { path: ".config/gh/hosts.yml", machine: true },

  // npm / Node.js (contains auth tokens)
  { path: ".npmrc", machine: true },

  // Python (contains auth tokens)
  { path: ".pypirc", machine: true },

  // Generic (contains login credentials)
  { path: ".netrc", machine: true },

  // Kubernetes
  { path: ".kube/config", machine: true },

  // Docker (contains registry auth)
  { path: ".docker/config.json", machine: true },

  // Git
  { path: ".gitconfig", machine: false },
];

/**
 * Detect well-known secret files under $HOME.
 * Returns ManagedFile entries with paths relative to $HOME.
 */
export async function detectHomeSecrets(): Promise<ManagedFile[]> {
  const home = homedir();
  const found: ManagedFile[] = [];

  for (const pattern of HOME_PATTERNS) {
    if (pattern.glob) {
      const expanded = await expandGlob(home, pattern.path);
      for (const relPath of expanded) {
        found.push({ path: relPath, machine: pattern.machine });
      }
    } else {
      const absPath = resolve(home, pattern.path);
      const exists = await access(absPath).then(() => true, () => false);
      if (exists) {
        found.push({
          path: pattern.path,
          ...(pattern.machine ? { machine: true } : {}),
        });
      }
    }
  }

  return found;
}

/**
 * Expand a simple glob pattern like ".ssh/id_*" under a base directory.
 * Only supports trailing "*" in the last path segment.
 */
async function expandGlob(base: string, pattern: string): Promise<string[]> {
  const parts = pattern.split("/");
  const dirParts = parts.slice(0, -1);
  const filePattern = parts[parts.length - 1];

  const dir = resolve(base, ...dirParts);
  const prefix = filePattern.replace("*", "");

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.startsWith(prefix))
      .map((e) => [...dirParts, e.name].join("/"));
  } catch {
    return [];
  }
}
