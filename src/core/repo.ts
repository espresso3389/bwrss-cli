import { resolve, basename } from "node:path";
import { stat, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { SKIP_DIRS } from "../util/patterns.ts";

/**
 * Check if a directory is a git repo root (contains .git).
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  const gitPath = resolve(dir, ".git");
  try {
    await stat(gitPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the git repo root from a given path by walking up.
 */
export async function findRepoRoot(dir: string): Promise<string | null> {
  let current = resolve(dir);
  while (true) {
    if (await isGitRepo(current)) return current;
    const parent = resolve(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Recursively find all git repo roots under a directory.
 * If the directory itself is a repo, returns just that (no recursion into sub-repos).
 * If not, walks subdirectories skipping well-known non-project dirs.
 */
export async function findRepos(dir: string): Promise<string[]> {
  const absDir = resolve(dir);
  if (await isGitRepo(absDir)) return [absDir];

  const repos: string[] = [];
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const child = resolve(absDir, entry.name);
      const childRepos = await findRepos(child);
      repos.push(...childRepos);
    }
  } catch {
    // permission denied or similar
  }
  return repos;
}

/**
 * Get the canonical name for a repo. Tries git remote origin URL first,
 * falls back to directory name.
 */
export async function getCanonicalName(repoRoot: string): Promise<string> {
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile("git", ["remote", "get-url", "origin"], { cwd: repoRoot }, (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout.trim());
      });
    });
    if (output) return normalizeRemoteUrl(output);
  } catch {
    // no git remote
  }
  return basename(repoRoot);
}

/**
 * Normalize a git remote URL to a canonical form.
 * - git@github.com:user/repo.git → github.com/user/repo
 * - https://github.com/user/repo.git → github.com/user/repo
 */
function normalizeRemoteUrl(url: string): string {
  let normalized = url;

  // SSH format: git@host:user/repo.git
  const sshMatch = normalized.match(/^[\w-]+@([\w.-]+):(.*?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // HTTPS format
  try {
    const parsed = new URL(normalized);
    let path = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "");
    return `${parsed.host}/${path}`;
  } catch {
    // fallback: strip .git suffix
    return normalized.replace(/\.git$/, "");
  }
}
