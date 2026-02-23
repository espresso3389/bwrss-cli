import { resolve } from "node:path";
import { readFile, writeFile, access } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { findRepos, getCanonicalName } from "../core/repo.ts";
import { readConfig, configExists } from "../core/config.ts";
import { ensureUnlocked, sync } from "../core/bitwarden.ts";
import { getParser } from "../parsers/index.ts";
import { log } from "../util/logger.ts";
import { setFileMode, modeToString } from "../util/permissions.ts";
import { getMachineName } from "../core/machine.ts";
import { mergePayloads, fetchPayload, fetchMachinePayload } from "../core/sync.ts";
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

    // Check if any files are machine-specific
    const hasMachineFiles = config.files.some((f) => f.machine);
    let machineName: string | undefined;
    if (hasMachineFiles) {
      machineName = await getMachineName();
    }

    if (options.dryRun) {
      console.log(chalk.bold(`[dry-run] Would restore from ${noteName}`));
      if (machineName) {
        console.log(chalk.bold(`[dry-run] Would also restore from ${noteName}@${machineName}`));
      }
    }

    const spinner = ora(`Restoring secrets for ${canonicalName}...`).start();

    try {
      await ensureUnlocked();
      await sync();

      // Fetch shared payloads
      spinner.text = "Downloading shared secrets...";
      const sharedPayloads = await fetchPayload(canonicalName);

      // Fetch machine-specific payloads if needed
      let machinePayloads: FilePayload[] | null = null;
      if (machineName) {
        spinner.text = `Downloading machine secrets for ${machineName}...`;
        machinePayloads = await fetchMachinePayload(canonicalName, machineName);
      }

      if (!sharedPayloads && !machinePayloads) {
        spinner.fail(`No Bitwarden data found for ${noteName}`);
        continue;
      }

      // Merge shared + machine payloads
      const allPayloads = mergePayloads(sharedPayloads ?? [], machinePayloads ?? []);

      spinner.stop();

      // Build a map of config file paths to their key patterns
      const configFileMap = new Map(config.files.map((f) => [f.path, f.keys]));

      for (const filePayload of allPayloads) {
        // Only restore files listed in the local config
        if (!configFileMap.has(filePayload.path)) {
          log.dim(`Skipping ${filePayload.path} (not in local .bwrss config)`);
          continue;
        }

        const filePath = resolve(repoRoot, filePayload.path);
        const fileExists = await access(filePath).then(() => true, () => false);

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
            const encPart = filePayload.encoding === "base64" ? " [binary]" : "";
            const modePart = filePayload.mode !== undefined ? ` ${modeToString(filePayload.mode)}` : "";
            const size = filePayload.encoding === "base64"
              ? Math.ceil(filePayload.content.length * 3 / 4)
              : filePayload.content.length;
            console.log(chalk.cyan(`  ${filePayload.path}`) + chalk.dim(`${modePart}${encPart} (full file, ${size} bytes)`));
            continue;
          }

          // Decode content
          const buf = filePayload.encoding === "base64"
            ? Buffer.from(filePayload.content, "base64")
            : Buffer.from(filePayload.content, "utf-8");

          await writeFile(filePath, buf);

          // Restore file permissions if present
          if (filePayload.mode !== undefined) {
            await setFileMode(filePath, filePayload.mode);
          }

          log.success(`Restored ${filePayload.path}` + (filePayload.mode !== undefined ? ` (${modeToString(filePayload.mode)})` : ""));
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
            existingContent = await readFile(filePath, "utf-8");
          }

          const merged = parser.merge(existingContent, filePayload.keys);
          await writeFile(filePath, merged, "utf-8");

          // Restore file permissions if present
          if (filePayload.mode !== undefined) {
            await setFileMode(filePath, filePayload.mode);
          }

          log.success(`Merged ${Object.keys(filePayload.keys).length} keys into ${filePayload.path}`);
        }
      }
    } catch (e) {
      spinner.fail(`Failed to restore secrets for ${canonicalName}`);
      log.error(e instanceof Error ? e.message : String(e));
    }
  }
}
