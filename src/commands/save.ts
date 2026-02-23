import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { findRepos, getCanonicalName } from "../core/repo.ts";
import { readConfig, configExists } from "../core/config.ts";
import { ensureUnlocked, sync, findBwrssItem, createSecureNote, updateItemNotes, setAttachment } from "../core/bitwarden.ts";
import { buildMetadata, buildPayload, ATTACHMENT_FILENAME } from "../core/storage.ts";
import { getParser } from "../parsers/index.ts";
import { log } from "../util/logger.ts";
import type { FilePayload } from "../types/index.ts";

export async function saveCommand(dirs: string[], options: { dryRun?: boolean }): Promise<void> {
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

    // Read and process files
    const filePayloads: FilePayload[] = [];

    for (const managedFile of config.files) {
      const filePath = resolve(repoRoot, managedFile.path);
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        log.warn(`File not found: ${managedFile.path}, skipping.`);
        continue;
      }

      const content = await file.text();

      if (managedFile.keys && managedFile.keys.length > 0) {
        // Partial: extract only specified keys
        const parser = getParser(managedFile.path);
        if (!parser) {
          log.warn(`No parser for ${managedFile.path}, saving as full file.`);
          filePayloads.push({ path: managedFile.path, content });
          continue;
        }
        const extracted = parser.extract(content, managedFile.keys);
        if (Object.keys(extracted).length === 0) {
          log.warn(`No matching keys found in ${managedFile.path}.`);
        }
        filePayloads.push({ path: managedFile.path, keys: extracted });
      } else {
        // Full file
        filePayloads.push({ path: managedFile.path, content });
      }
    }

    if (filePayloads.length === 0) {
      log.warn(`No files to save for ${canonicalName}.`);
      continue;
    }

    if (options.dryRun) {
      console.log();
      console.log(chalk.bold(`[dry-run] Would save to ${noteName}:`));
      for (const fp of filePayloads) {
        if (fp.content !== undefined) {
          console.log(chalk.cyan(`  ${fp.path}`) + chalk.dim(` (full file, ${fp.content.length} bytes)`));
        } else if (fp.keys) {
          console.log(chalk.cyan(`  ${fp.path}`) + chalk.dim(` (${Object.keys(fp.keys).length} keys)`));
          for (const key of Object.keys(fp.keys)) {
            console.log(chalk.dim(`    - ${key}`));
          }
        }
      }
      console.log();
      continue;
    }

    // Bitwarden operations
    const spinner = ora(`Saving secrets for ${canonicalName}...`).start();

    try {
      await ensureUnlocked();
      await sync();

      const metadata = buildMetadata(canonicalName, filePayloads);
      const payload = buildPayload(canonicalName, filePayloads);

      let item = await findBwrssItem(canonicalName);

      if (item) {
        spinner.text = `Updating existing note ${noteName}...`;
        item = await updateItemNotes(item, metadata);
      } else {
        spinner.text = `Creating new note ${noteName}...`;
        item = await createSecureNote(noteName, metadata);
      }

      spinner.text = "Uploading attachment...";
      await setAttachment(item.id, ATTACHMENT_FILENAME, payload);

      spinner.succeed(`Saved ${filePayloads.length} file(s) to ${noteName}`);
    } catch (e) {
      spinner.fail(`Failed to save secrets for ${canonicalName}`);
      log.error(e instanceof Error ? e.message : String(e));
    }
  }
}
