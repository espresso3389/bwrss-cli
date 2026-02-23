import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { homeConfigPath, homeConfigExists, readHomeConfig, writeHomeConfig, resolveHomePath } from "../core/home.ts";
import { ensureUnlocked, sync } from "../core/bitwarden.ts";
import { getMachineName, chooseMachineName } from "../core/machine.ts";
import { splitByMachine, uploadPayload, uploadMachinePayload, mergePayloads, fetchPayload, fetchMachinePayload } from "../core/sync.ts";
import { getFileMode, setFileMode, modeToString } from "../util/permissions.ts";
import { detectHomeSecrets } from "../util/home-patterns.ts";
import { log } from "../util/logger.ts";
import type { BwrssConfig, FilePayload, ManagedFile } from "../types/index.ts";

const HOME_CANONICAL_NAME = "home";

/**
 * Detect whether a buffer contains binary content.
 */
function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * `bwrss home init` — detect home secrets and generate ~/.config/bwrss/home.yaml.
 */
export async function homeInitCommand(options: { force?: boolean }): Promise<void> {
  const configPath = homeConfigPath();

  if (await homeConfigExists()) {
    if (!options.force) {
      log.warn(`Home config already exists at ${configPath}. Use --force to overwrite.`);
      console.log();
      await homeListCommand();
      return;
    }
  }

  const files = await detectHomeSecrets();

  if (files.length === 0) {
    log.info("No well-known secret files detected under $HOME.");
    log.info(`You can create ${configPath} manually and add files to manage.`);
    return;
  }

  const config: BwrssConfig = {
    version: 1,
    name: HOME_CANONICAL_NAME,
    files,
  };

  await writeHomeConfig(config);
  log.success(`Created home config at ${configPath}`);

  const shared = files.filter((f) => !f.machine);
  const machine = files.filter((f) => f.machine);

  console.log();
  console.log(chalk.bold("Home Secret Scan Results"));
  console.log(chalk.dim("─".repeat(60)));
  console.log(chalk.dim(padRight("File", 40) + "Storage"));
  console.log(chalk.dim("─".repeat(60)));

  for (const f of shared) {
    console.log(padRight(chalk.cyan(`~/${f.path}`), 40) + chalk.dim("shared"));
  }
  for (const f of machine) {
    console.log(padRight(chalk.cyan(`~/${f.path}`), 40) + chalk.yellow("machine-specific"));
  }

  console.log(chalk.dim("─".repeat(60)));
  console.log(`${files.length} files found, ${shared.length} shared, ${machine.length} machine-specific`);
  console.log();

  // Always show machine chooser if machine-specific files were detected
  if (machine.length > 0) {
    const machineName = await chooseMachineName();
    log.success(`Machine name set to "${machineName}"`);
  }

  console.log(chalk.dim(`Config: ${configPath}`));
}

/**
 * `bwrss home list` — show currently managed home files.
 */
export async function homeListCommand(): Promise<void> {
  if (!(await homeConfigExists())) {
    log.error(`No home config found. Run 'bwrss home init' first.`);
    return;
  }

  const config = await readHomeConfig();
  const files = config.files;
  const ignoredPatterns = config.ignoredFiles ?? [];

  // Detect files that exist on disk but are not managed — show ignored ones
  const detected = await detectHomeSecrets();
  const managedPaths = new Set(files.map((f) => f.path));
  const unmanagedIgnored = detected.filter(
    (f) => !managedPaths.has(f.path) && isIgnored(f.path, ignoredPatterns),
  );

  if (files.length === 0 && unmanagedIgnored.length === 0) {
    log.info("No files configured. Edit the home config to add files.");
    return;
  }

  // Split managed files into active vs ignored
  const activeFiles = files.filter((f) => !isIgnored(f.path, ignoredPatterns));
  const managedIgnored = files.filter((f) => isIgnored(f.path, ignoredPatterns));
  const allIgnored = [...managedIgnored, ...unmanagedIgnored];

  const shared = activeFiles.filter((f) => !f.machine);
  const machine = activeFiles.filter((f) => f.machine);

  console.log();
  console.log(chalk.bold("Managed Home Files"));
  console.log(chalk.dim("─".repeat(60)));
  console.log(chalk.dim(padRight("File", 40) + padRight("Storage", 18) + "Status"));
  console.log(chalk.dim("─".repeat(60)));

  for (const f of [...shared, ...machine]) {
    const filePath = resolveHomePath(f.path);
    const exists = await access(filePath).then(() => true, () => false);
    const storage = f.machine ? chalk.yellow("machine-specific") : chalk.dim("shared");
    const status = exists ? chalk.green("present") : chalk.red("missing");
    console.log(padRight(chalk.cyan(`~/${f.path}`), 40) + padRight(storage, 18) + status);
  }

  for (const f of allIgnored) {
    const storage = f.machine ? chalk.yellow("machine-specific") : chalk.dim("shared");
    console.log(padRight(chalk.dim(`~/${f.path}`), 40) + padRight(storage, 18) + chalk.dim("ignored"));
  }

  console.log(chalk.dim("─".repeat(60)));
  const parts = [`${activeFiles.length} managed`, `${shared.length} shared`, `${machine.length} machine-specific`];
  if (allIgnored.length > 0) parts.push(`${allIgnored.length} ignored`);
  console.log(parts.join(", "));
  console.log();
  console.log(chalk.dim(`Config: ${homeConfigPath()}`));
  console.log();
}

/**
 * `bwrss home scan` — scan $HOME for well-known secrets.
 *   default / --dry-run: show what was detected
 *   --update: merge newly found files into existing home.yaml
 */
export async function homeScanCommand(options: { dryRun?: boolean; update?: boolean }): Promise<void> {
  const detected = await detectHomeSecrets();

  if (detected.length === 0) {
    log.info("No well-known secret files detected under $HOME.");
    return;
  }

  // Load existing config if present
  let existing: ManagedFile[] = [];
  let ignoredPatterns: string[] = [];
  let existingConfig: BwrssConfig | undefined;
  if (await homeConfigExists()) {
    existingConfig = await readHomeConfig();
    existing = existingConfig.files;
    ignoredPatterns = existingConfig.ignoredFiles ?? [];
  }

  const existingPaths = new Set(existing.map((f) => f.path));

  // Categorize all detected files
  const alreadyManaged: ManagedFile[] = [];
  const managedIgnored: ManagedFile[] = [];
  const newFiles: ManagedFile[] = [];
  const newIgnored: ManagedFile[] = [];

  for (const f of detected) {
    const isManaged = existingPaths.has(f.path);
    const ignored = isIgnored(f.path, ignoredPatterns);

    if (isManaged && ignored) {
      managedIgnored.push(f);
    } else if (isManaged) {
      alreadyManaged.push(f);
    } else if (ignored) {
      newIgnored.push(f);
    } else {
      newFiles.push(f);
    }
  }

  const allIgnored = [...managedIgnored, ...newIgnored];

  // Display scan results
  console.log();
  console.log(chalk.bold("Home Secret Scan Results"));
  console.log(chalk.dim("─".repeat(60)));
  console.log(chalk.dim(padRight("File", 40) + padRight("Storage", 18) + "Status"));
  console.log(chalk.dim("─".repeat(60)));

  for (const f of alreadyManaged) {
    const storage = f.machine ? chalk.yellow("machine-specific") : chalk.dim("shared");
    console.log(padRight(chalk.cyan(`~/${f.path}`), 40) + padRight(storage, 18) + chalk.dim("managed"));
  }
  for (const f of newFiles) {
    const storage = f.machine ? chalk.yellow("machine-specific") : chalk.dim("shared");
    console.log(padRight(chalk.cyan(`~/${f.path}`), 40) + padRight(storage, 18) + chalk.green("new"));
  }
  for (const f of allIgnored) {
    const storage = f.machine ? chalk.yellow("machine-specific") : chalk.dim("shared");
    console.log(padRight(chalk.dim(`~/${f.path}`), 40) + padRight(storage, 18) + chalk.dim("ignored"));
  }

  console.log(chalk.dim("─".repeat(60)));
  const parts = [`${detected.length} detected`, `${alreadyManaged.length} managed`, `${newFiles.length} new`];
  if (allIgnored.length > 0) parts.push(`${allIgnored.length} ignored`);
  console.log(parts.join(", "));
  console.log();
  console.log(chalk.dim(`Config: ${homeConfigPath()}`));

  if (newFiles.length === 0) {
    log.info("No new files to add.");
    return;
  }

  if (!options.update) {
    log.info("Run with --update to add new files to the home config.");
    return;
  }

  // Merge new files into config (ignored files are excluded)
  const merged = [...existing, ...newFiles];
  const config: BwrssConfig = {
    version: 1,
    name: existingConfig?.name ?? HOME_CANONICAL_NAME,
    files: merged,
    ...(ignoredPatterns.length > 0 ? { ignoredFiles: ignoredPatterns } : {}),
  };

  await writeHomeConfig(config);
  log.success(`Added ${newFiles.length} new file(s) to home config.`);
}

/**
 * `bwrss home add` — add a file to the home config.
 */
export async function homeAddCommand(filePath: string, options: { machine?: boolean }): Promise<void> {
  if (!(await homeConfigExists())) {
    log.error(`No home config found. Run 'bwrss home init' first.`);
    return;
  }

  const config = await readHomeConfig();

  // Normalize path: strip ~/ prefix if present
  const relPath = filePath.replace(/^~\//, "");

  // Check if already managed
  if (config.files.some((f) => f.path === relPath)) {
    log.warn(`~/${relPath} is already managed.`);
    return;
  }

  // Check if ignored
  if (isIgnored(relPath, config.ignoredFiles ?? [])) {
    log.warn(`~/${relPath} matches an ignore pattern. Remove it with 'bwrss home ignore --remove' first.`);
    return;
  }

  // Check file exists
  const absPath = resolveHomePath(relPath);
  const exists = await access(absPath).then(() => true, () => false);
  if (!exists) {
    log.warn(`~/${relPath} does not exist. Adding anyway.`);
  }

  config.files.push({
    path: relPath,
    ...(options.machine ? { machine: true } : {}),
  });

  await writeHomeConfig(config);
  const tag = options.machine ? " (machine-specific)" : "";
  log.success(`Added ~/${relPath}${tag} to home config.`);
}

/**
 * `bwrss home remove` — remove a file from the home config.
 */
export async function homeRemoveCommand(filePath: string): Promise<void> {
  if (!(await homeConfigExists())) {
    log.error(`No home config found. Run 'bwrss home init' first.`);
    return;
  }

  const config = await readHomeConfig();
  const relPath = filePath.replace(/^~\//, "");

  const idx = config.files.findIndex((f) => f.path === relPath);
  if (idx === -1) {
    log.warn(`~/${relPath} is not in the home config.`);
    return;
  }

  config.files.splice(idx, 1);
  await writeHomeConfig(config);
  log.success(`Removed ~/${relPath} from home config.`);
}

/**
 * `bwrss home ignore` — add or remove ignore patterns.
 *   bwrss home ignore PATTERN         — add pattern
 *   bwrss home ignore --remove PATTERN — remove pattern
 *   bwrss home ignore --list          — show current patterns
 */
export async function homeIgnoreCommand(pattern: string | undefined, options: { remove?: boolean; list?: boolean }): Promise<void> {
  if (!(await homeConfigExists())) {
    log.error(`No home config found. Run 'bwrss home init' first.`);
    return;
  }

  const config = await readHomeConfig();
  const ignored = config.ignoredFiles ?? [];

  if (options.list || (!pattern && !options.remove)) {
    if (ignored.length === 0) {
      log.info("No ignore patterns configured.");
    } else {
      console.log();
      console.log(chalk.bold("Ignored patterns:"));
      for (const p of ignored) {
        console.log(`  ${chalk.dim(p)}`);
      }
      console.log();
    }
    return;
  }

  if (!pattern) {
    log.error("Pattern is required.");
    return;
  }

  const normalized = normalizeIgnorePattern(pattern);

  if (options.remove) {
    const idx = ignored.indexOf(normalized);
    if (idx === -1) {
      log.warn(`Pattern "${normalized}" is not in the ignore list.`);
      return;
    }
    ignored.splice(idx, 1);
    config.ignoredFiles = ignored;
    await writeHomeConfig(config);
    log.success(`Removed ignore pattern "${normalized}".`);
    return;
  }

  // Add pattern
  if (ignored.includes(normalized)) {
    log.warn(`Pattern "${normalized}" is already ignored.`);
    return;
  }

  ignored.push(normalized);
  config.ignoredFiles = ignored;
  await writeHomeConfig(config);
  log.success(`Added ignore pattern "${normalized}".`);
}

/**
 * Normalize an ignore pattern to be relative to $HOME.
 * Strips absolute home path prefix, ~/ prefix, and leading /.
 */
function normalizeIgnorePattern(pattern: string): string {
  const home = resolveHomePath("");
  // Strip absolute home path (e.g. /home/user/.ssh/ → .ssh/)
  if (pattern.startsWith(home + "/")) {
    pattern = pattern.slice(home.length + 1);
  } else if (pattern.startsWith(home)) {
    pattern = pattern.slice(home.length);
  }
  // Strip ~/ prefix
  if (pattern.startsWith("~/")) {
    pattern = pattern.slice(2);
  }
  // Strip leading /
  if (pattern.startsWith("/")) {
    pattern = pattern.slice(1);
  }
  return pattern;
}

/**
 * Check if a path matches any of the ignore patterns.
 * Supports simple wildcards: * matches anything within a segment,
 * trailing / matches directory prefix.
 */
function isIgnored(path: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    if (matchIgnorePattern(path, normalizeIgnorePattern(raw))) return true;
  }
  return false;
}

/**
 * Match a path against a single normalized ignore pattern.
 * - Trailing `/` means "anything under this directory"
 * - `*` matches any characters within a path segment
 * - Exact match otherwise
 */
function matchIgnorePattern(path: string, pattern: string): boolean {
  // Directory prefix pattern (e.g. ".config/")
  if (pattern.endsWith("/")) {
    return path.startsWith(pattern) || path + "/" === pattern;
  }

  // Convert glob pattern to regex
  const regexStr = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    + "$";
  return new RegExp(regexStr).test(path);
}

/**
 * `bwrss home save` — save home secrets to Bitwarden.
 */
export async function homeSaveCommand(options: { dryRun?: boolean }): Promise<void> {
  if (!(await homeConfigExists())) {
    log.error(`No home config found. Run 'bwrss home init' first.`);
    return;
  }

  const config = await readHomeConfig();
  const canonicalName = config.name ?? HOME_CANONICAL_NAME;
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
    const filePath = resolveHomePath(managedFile.path);

    if (!(await access(filePath).then(() => true, () => false))) {
      log.warn(`File not found: ~/${managedFile.path}, skipping.`);
      continue;
    }

    const mode = await getFileMode(filePath);
    const buf = Buffer.from(await readFile(filePath));
    const binary = isBinary(buf);

    const content = binary ? buf.toString("base64") : buf.toString("utf-8");
    filePayloads.push({
      path: managedFile.path,
      content,
      mode,
      ...(binary ? { encoding: "base64" as const } : {}),
    });
  }

  if (filePayloads.length === 0) {
    log.warn("No files to save.");
    return;
  }

  // Split into shared and machine-specific
  const { shared, machine } = splitByMachine(config, filePayloads);

  if (options.dryRun) {
    console.log();
    if (shared.length > 0) {
      console.log(chalk.bold(`[dry-run] Would save to ${noteName}:`));
      for (const fp of shared) {
        printFilePayload(fp);
      }
    }
    if (machine.length > 0) {
      const machineLabel = machineName ?? "<machine>";
      console.log(chalk.bold(`[dry-run] Would save to ${noteName}@${machineLabel}:`));
      for (const fp of machine) {
        printFilePayload(fp);
      }
    }
    console.log();
    return;
  }

  const spinner = ora(`Saving home secrets...`).start();

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
    spinner.succeed(`Saved ${totalFiles} home file(s) (${parts.join(", ")})`);
  } catch (e) {
    spinner.fail("Failed to save home secrets");
    log.error(e instanceof Error ? e.message : String(e));
  }
}

/**
 * `bwrss home restore` — restore home secrets from Bitwarden.
 */
export async function homeRestoreCommand(options: { dryRun?: boolean; force?: boolean }): Promise<void> {
  if (!(await homeConfigExists())) {
    log.error(`No home config found. Run 'bwrss home init' first.`);
    return;
  }

  const config = await readHomeConfig();
  const canonicalName = config.name ?? HOME_CANONICAL_NAME;
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

  const spinner = ora(`Restoring home secrets...`).start();

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
      return;
    }

    // Merge shared + machine payloads
    const allPayloads = mergePayloads(sharedPayloads ?? [], machinePayloads ?? []);

    spinner.stop();

    // Build a set of managed file paths
    const managedPaths = new Set(config.files.map((f) => f.path));

    for (const filePayload of allPayloads) {
      if (!managedPaths.has(filePayload.path)) {
        log.dim(`Skipping ${filePayload.path} (not in home config)`);
        continue;
      }

      const filePath = resolveHomePath(filePayload.path);
      const fileExists = await access(filePath).then(() => true, () => false);

      if (filePayload.content === undefined) continue;

      if (fileExists && !options.force) {
        if (options.dryRun) {
          console.log(chalk.yellow(`  ~/${filePayload.path}`) + chalk.dim(" (exists, would skip without --force)"));
          continue;
        }
        log.warn(`~/${filePayload.path} exists, skipping (use --force to overwrite).`);
        continue;
      }

      if (options.dryRun) {
        const encPart = filePayload.encoding === "base64" ? " [binary]" : "";
        const modePart = filePayload.mode !== undefined ? ` ${modeToString(filePayload.mode)}` : "";
        const size = filePayload.encoding === "base64"
          ? Math.ceil(filePayload.content.length * 3 / 4)
          : filePayload.content.length;
        console.log(chalk.cyan(`  ~/${filePayload.path}`) + chalk.dim(`${modePart}${encPart} (full file, ${size} bytes)`));
        continue;
      }

      // Ensure parent directory exists (e.g. ~/.ssh/)
      await mkdir(dirname(filePath), { recursive: true });

      // Decode content
      const buf = filePayload.encoding === "base64"
        ? Buffer.from(filePayload.content, "base64")
        : Buffer.from(filePayload.content, "utf-8");

      await writeFile(filePath, buf);

      // Restore file permissions if present
      if (filePayload.mode !== undefined) {
        await setFileMode(filePath, filePayload.mode);
      }

      log.success(`Restored ~/${filePayload.path}` + (filePayload.mode !== undefined ? ` (${modeToString(filePayload.mode)})` : ""));
    }
  } catch (e) {
    spinner.fail("Failed to restore home secrets");
    log.error(e instanceof Error ? e.message : String(e));
  }
}

function padRight(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  if (stripped.length >= len) return str;
  return str + " ".repeat(len - stripped.length);
}

function printFilePayload(fp: FilePayload): void {
  const modePart = fp.mode !== undefined ? ` ${modeToString(fp.mode)}` : "";
  const encPart = fp.encoding === "base64" ? " [binary]" : "";
  if (fp.content !== undefined) {
    const size = fp.encoding === "base64"
      ? Math.ceil(fp.content.length * 3 / 4)
      : fp.content.length;
    console.log(chalk.cyan(`  ~/${fp.path}`) + chalk.dim(`${modePart}${encPart} (full file, ${size} bytes)`));
  }
}
