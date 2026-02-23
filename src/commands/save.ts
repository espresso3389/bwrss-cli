import { resolve } from "node:path";
import { readFile, access } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { findRepos, getCanonicalName } from "../core/repo.ts";
import { readConfig, configExists } from "../core/config.ts";
import { ensureUnlocked, sync } from "../core/bitwarden.ts";
import { getParser } from "../parsers/index.ts";
import { log } from "../util/logger.ts";
import { getFileMode, modeToString } from "../util/permissions.ts";
import { getMachineName } from "../core/machine.ts";
import { splitByMachine, uploadPayload, uploadMachinePayload } from "../core/sync.ts";
import type { FilePayload } from "../types/index.ts";

/**
 * Detect whether a buffer contains binary (non-text) content.
 */
function isBinary(buf: Buffer): boolean {
  // Check for null bytes in the first 8KB — a simple heuristic
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

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

    // Check if any files are machine-specific
    const hasMachineFiles = config.files.some((f) => f.machine);
    let machineName: string | undefined;
    if (hasMachineFiles && !options.dryRun) {
      machineName = await getMachineName();
    }

    // Read and process files
    const filePayloads: FilePayload[] = [];

    for (const managedFile of config.files) {
      const filePath = resolve(repoRoot, managedFile.path);

      if (!(await access(filePath).then(() => true, () => false))) {
        log.warn(`File not found: ${managedFile.path}, skipping.`);
        continue;
      }

      // Capture file permissions
      const mode = await getFileMode(filePath);

      // Read as buffer to detect binary content
      const buf = Buffer.from(await readFile(filePath));
      const binary = isBinary(buf);

      if (managedFile.keys && managedFile.keys.length > 0) {
        // Partial: extract only specified keys (not applicable to binary files)
        const parser = getParser(managedFile.path);
        if (!parser) {
          log.warn(`No parser for ${managedFile.path}, saving as full file.`);
          const content = binary ? buf.toString("base64") : buf.toString("utf-8");
          filePayloads.push({
            path: managedFile.path,
            content,
            mode,
            ...(binary ? { encoding: "base64" as const } : {}),
          });
          continue;
        }
        const content = buf.toString("utf-8");
        const extracted = parser.extract(content, managedFile.keys);
        if (Object.keys(extracted).length === 0) {
          log.warn(`No matching keys found in ${managedFile.path}.`);
        }
        filePayloads.push({ path: managedFile.path, keys: extracted, mode });
      } else {
        // Full file
        const content = binary ? buf.toString("base64") : buf.toString("utf-8");
        filePayloads.push({
          path: managedFile.path,
          content,
          mode,
          ...(binary ? { encoding: "base64" as const } : {}),
        });
      }
    }

    if (filePayloads.length === 0) {
      log.warn(`No files to save for ${canonicalName}.`);
      continue;
    }

    // Split into shared and machine-specific
    const { shared, machine } = splitByMachine(config, filePayloads);

    if (options.dryRun) {
      console.log();
      if (shared.length > 0) {
        console.log(chalk.bold(`[dry-run] Would save to ${noteName}:`));
        printPayloadSummary(shared);
      }
      if (machine.length > 0) {
        const machineLabel = machineName ?? "<machine>";
        console.log(chalk.bold(`[dry-run] Would save to ${noteName}@${machineLabel}:`));
        printPayloadSummary(machine);
      }
      console.log();
      continue;
    }

    // Bitwarden operations
    const spinner = ora(`Saving secrets for ${canonicalName}...`).start();

    try {
      await ensureUnlocked();
      await sync();

      if (shared.length > 0) {
        await uploadPayload(noteName, canonicalName, shared, spinner);
      }

      if (machine.length > 0 && machineName) {
        await uploadMachinePayload(canonicalName, machineName, machine, spinner);
      }

      const totalFiles = shared.length + machine.length;
      const parts: string[] = [];
      if (shared.length > 0) parts.push(`${shared.length} shared`);
      if (machine.length > 0) parts.push(`${machine.length} machine-specific`);
      spinner.succeed(`Saved ${totalFiles} file(s) (${parts.join(", ")}) for ${canonicalName}`);
    } catch (e) {
      spinner.fail(`Failed to save secrets for ${canonicalName}`);
      log.error(e instanceof Error ? e.message : String(e));
    }
  }
}

function printPayloadSummary(payloads: FilePayload[]): void {
  for (const fp of payloads) {
    const modePart = fp.mode !== undefined ? ` ${modeToString(fp.mode)}` : "";
    const encPart = fp.encoding === "base64" ? " [binary]" : "";
    if (fp.content !== undefined) {
      const size = fp.encoding === "base64"
        ? Math.ceil(fp.content.length * 3 / 4) // approximate decoded size
        : fp.content.length;
      console.log(chalk.cyan(`  ${fp.path}`) + chalk.dim(`${modePart}${encPart} (full file, ${size} bytes)`));
    } else if (fp.keys) {
      console.log(chalk.cyan(`  ${fp.path}`) + chalk.dim(`${modePart} (${Object.keys(fp.keys).length} keys)`));
      for (const key of Object.keys(fp.keys)) {
        console.log(chalk.dim(`    - ${key}`));
      }
    }
  }
}
