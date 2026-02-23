import { resolve } from "path";
import { readdir } from "fs/promises";
import chalk from "chalk";
import { findRepos, getCanonicalName } from "../core/repo.ts";
import { configExists, readConfig } from "../core/config.ts";
import { log } from "../util/logger.ts";
import type { ScanResult } from "../types/index.ts";

const SECRET_FILE_NAMES = new Set([
  ".env", ".env.local", ".env.development", ".env.production", ".env.staging", ".env.test",
  "secrets.json", "secrets.yaml", "secrets.yml", "secrets.toml",
  "credentials.json", "service-account.json",
]);

export async function scanCommand(dirs: string[]): Promise<void> {
  const repoRoots: string[] = [];
  for (const dir of dirs) {
    const found = await findRepos(resolve(dir));
    repoRoots.push(...found);
  }

  if (repoRoots.length === 0) {
    log.warn("No git repositories found.");
    return;
  }

  const results: ScanResult[] = [];
  for (const repoRoot of repoRoots) {
    results.push(await scanRepo(repoRoot));
  }

  // Print results table
  console.log();
  console.log(chalk.bold("Repository Scan Results"));
  console.log(chalk.dim("─".repeat(80)));
  console.log(
    chalk.dim(
      padRight("Repository", 40) +
      padRight("Status", 14) +
      padRight("Secrets", 10) +
      "Managed",
    ),
  );
  console.log(chalk.dim("─".repeat(80)));

  for (const r of results) {
    console.log(
      padRight(r.repoPath, 40) +
      padRight(r.hasBwrss ? "configured" : "unmanaged", 14) +
      padRight(String(r.secretFiles.length), 10) +
      (r.hasBwrss ? String(r.managedFiles.length) : "-"),
    );
  }

  console.log(chalk.dim("─".repeat(80)));
  const configured = results.filter((r) => r.hasBwrss).length;
  console.log(
    `${results.length} repos found, ${configured} configured, ${results.length - configured} unmanaged`,
  );
  console.log();
}

async function scanRepo(repoRoot: string): Promise<ScanResult> {
  const canonicalName = await getCanonicalName(repoRoot);
  const hasBwrss = await configExists(repoRoot);
  const secretFiles = await findSecretFiles(repoRoot);
  let managedFiles: string[] = [];

  if (hasBwrss) {
    try {
      const config = await readConfig(repoRoot);
      managedFiles = config.files.map((f) => f.path);
    } catch {
      // invalid config
    }
  }

  return {
    repoPath: repoRoot,
    canonicalName,
    hasBwrss,
    secretFiles,
    managedFiles,
  };
}

async function findSecretFiles(repoRoot: string): Promise<string[]> {
  const found: string[] = [];
  try {
    const entries = await readdir(repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (SECRET_FILE_NAMES.has(entry.name) || entry.name.startsWith(".env")) {
        found.push(entry.name);
      }
    }
    try {
      const configEntries = await readdir(resolve(repoRoot, "config"), { withFileTypes: true });
      for (const entry of configEntries) {
        if (!entry.isFile()) continue;
        if (SECRET_FILE_NAMES.has(entry.name)) {
          found.push(`config/${entry.name}`);
        }
      }
    } catch {
      // no config/ dir
    }
  } catch {
    // permission denied
  }
  return found;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}
