import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { findRepos, getCanonicalName } from "../core/repo.ts";
import { readConfig, configExists } from "../core/config.ts";
import { ensureUnlocked, sync, findBwrssItem, getAttachment } from "../core/bitwarden.ts";
import { parsePayload, ATTACHMENT_FILENAME } from "../core/storage.ts";
import { getParser } from "../parsers/index.ts";
import { log } from "../util/logger.ts";
import type { FilePayload } from "../types/index.ts";

export async function restoreCommand(dirs: string[], options: { dryRun?: boolean; force?: boolean }): Promise<void> {
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
    if (!(await configExists(repoRoot))) {
      log.dim(`Skipping ${repoRoot} (no .bwrss config)`);
      continue;
    }

    const config = await readConfig(repoRoot);
    const canonicalName = config.name ?? await getCanonicalName(repoRoot);
    const noteName = `bwrss:${canonicalName}`;

    if (options.dryRun) {
      console.log(chalk.bold(`[dry-run] Would restore from ${noteName}`));
      // Still need BW to show what would be restored
    }

    const spinner = ora(`Restoring secrets for ${canonicalName}...`).start();

    try {
      await ensureUnlocked();
      await sync();

      const item = await findBwrssItem(canonicalName);
      if (!item) {
        spinner.fail(`No Bitwarden item found for ${noteName}`);
        continue;
      }

      const attachment = item.attachments?.find((a) => a.fileName === ATTACHMENT_FILENAME);
      if (!attachment) {
        spinner.fail(`No data attachment found on ${noteName}`);
        continue;
      }

      spinner.text = "Downloading attachment...";
      const payloadJson = await getAttachment(item.id, attachment.id);
      const payload = parsePayload(payloadJson);

      spinner.stop();

      // Build a map of config file paths to their key patterns
      const configFileMap = new Map(config.files.map((f) => [f.path, f.keys]));

      for (const filePayload of payload.files) {
        // Only restore files listed in the local config
        if (!configFileMap.has(filePayload.path)) {
          log.dim(`Skipping ${filePayload.path} (not in local .bwrss config)`);
          continue;
        }

        const filePath = resolve(repoRoot, filePayload.path);
        const fileExists = await Bun.file(filePath).exists();

        if (filePayload.content !== undefined) {
          // Full file restore
          if (fileExists && !options.force) {
            if (options.dryRun) {
              console.log(chalk.yellow(`  ${filePayload.path}`) + chalk.dim(" (exists, would skip without --force)"));
              continue;
            }
            log.warn(`${filePayload.path} exists, skipping (use --force to overwrite).`);
            continue;
          }

          if (options.dryRun) {
            console.log(chalk.cyan(`  ${filePayload.path}`) + chalk.dim(` (full file, ${filePayload.content.length} bytes)`));
            continue;
          }

          await Bun.write(filePath, filePayload.content);
          log.success(`Restored ${filePayload.path}`);
        } else if (filePayload.keys) {
          // Partial key merge
          const parser = getParser(filePayload.path);
          if (!parser) {
            log.warn(`No parser for ${filePayload.path}, skipping partial restore.`);
            continue;
          }

          if (options.dryRun) {
            console.log(chalk.cyan(`  ${filePayload.path}`) + chalk.dim(` (${Object.keys(filePayload.keys).length} keys to merge)`));
            for (const key of Object.keys(filePayload.keys)) {
              console.log(chalk.dim(`    - ${key}`));
            }
            continue;
          }

          let existingContent = "";
          if (fileExists) {
            existingContent = await Bun.file(filePath).text();
          }

          const merged = parser.merge(existingContent, filePayload.keys);
          await Bun.write(filePath, merged);
          log.success(`Merged ${Object.keys(filePayload.keys).length} keys into ${filePayload.path}`);
        }
      }
    } catch (e) {
      spinner.fail(`Failed to restore secrets for ${canonicalName}`);
      log.error(e instanceof Error ? e.message : String(e));
    }
  }
}
