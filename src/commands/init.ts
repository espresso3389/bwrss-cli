import { resolve } from "path";
import chalk from "chalk";
import { findRepos, getCanonicalName } from "../core/repo.ts";
import { configExists, writeConfig } from "../core/config.ts";
import { log } from "../util/logger.ts";
import type { BwrssConfig, ManagedFile } from "../types/index.ts";
import { readdir } from "fs/promises";

const SECRET_FILE_NAMES = new Set([
  ".env", ".env.local", ".env.development", ".env.production", ".env.staging", ".env.test",
  "secrets.json", "secrets.yaml", "secrets.yml", "secrets.toml",
  "credentials.json", "service-account.json",
]);

export async function initCommand(dirs: string[], options: { force?: boolean }): Promise<void> {
  const repoRoots: string[] = [];
  for (const dir of dirs) {
    const found = await findRepos(resolve(dir));
    repoRoots.push(...found);
  }

  if (repoRoots.length === 0) {
    log.warn("No git repositories found.");
    return;
  }

  for (const repoRoot of repoRoots) {
    if (await configExists(repoRoot) && !options.force) {
      log.warn(`${repoRoot} already has a .bwrss config. Use --force to overwrite.`);
      continue;
    }

    const canonicalName = await getCanonicalName(repoRoot);
    const secretFiles = await detectSecretFiles(repoRoot);

    const files: ManagedFile[] = secretFiles.map((path) => ({ path }));

    const config: BwrssConfig = {
      version: 1,
      name: canonicalName,
      files,
    };

    await writeConfig(repoRoot, config);
    log.success(`Created .bwrss config at ${repoRoot}/.bwrss`);

    if (files.length > 0) {
      log.info(`Detected ${files.length} secret file(s): ${secretFiles.join(", ")}`);
    } else {
      log.info("No well-known secret files detected. Edit .bwrss to add files manually.");
    }

    console.log(chalk.dim(`  Tip: Add .bwrss to version control and secret files to .gitignore`));
  }
}

async function detectSecretFiles(repoRoot: string): Promise<string[]> {
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
