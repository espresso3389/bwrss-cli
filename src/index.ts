import { Command } from "commander";
import { scanCommand } from "./commands/scan.ts";
import { initCommand } from "./commands/init.ts";
import { saveCommand } from "./commands/save.ts";
import { restoreCommand } from "./commands/restore.ts";
import { homeInitCommand, homeListCommand, homeScanCommand, homeAddCommand, homeRemoveCommand, homeIgnoreCommand, homeSaveCommand, homeRestoreCommand } from "./commands/home.ts";
import { ensureSession } from "./core/bitwarden.ts";
import { log } from "./util/logger.ts";

const program = new Command();

program
  .name("bwrss")
  .description("Bitwarden Repository Settings Sync — manage git repo secrets via Bitwarden")
  .version("0.1.0")
  .option("--bw-session <session>", "Bitwarden session key (alternative to BW_SESSION env var)");

/**
 * Helper: read the global --bw-session option and call ensureSession().
 */
function requireSession(cmd: Command): void {
  const opts = cmd.optsWithGlobals();
  try {
    ensureSession(opts.bwSession);
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

program
  .command("scan")
  .description("Scan directories for repos with secret files")
  .argument("[dirs...]", "Directories to scan (default: current directory)")
  .action((dirs: string[], opts) => scanCommand(dirs.length ? dirs : ["."], opts));

program
  .command("init")
  .description("Create .bwrss config for repos")
  .argument("[dirs...]", "Repo directories to initialize (default: current directory)")
  .option("--force", "Overwrite existing .bwrss config")
  .action((dirs: string[], opts) => initCommand(dirs.length ? dirs : ["."], opts));

program
  .command("save")
  .description("Save secrets to Bitwarden")
  .argument("[dirs...]", "Repo directories to save (default: current directory)")
  .option("--dry-run", "Show what would be saved without writing to Bitwarden")
  .hook("preAction", (thisCommand) => requireSession(thisCommand))
  .action((dirs: string[], opts) => saveCommand(dirs.length ? dirs : ["."], opts));

program
  .command("restore")
  .description("Restore secrets from Bitwarden")
  .argument("[dirs...]", "Repo directories to restore (default: current directory)")
  .option("--dry-run", "Show what would be restored without writing files")
  .option("--force", "Overwrite existing local files")
  .hook("preAction", (thisCommand) => requireSession(thisCommand))
  .action((dirs: string[], opts) => restoreCommand(dirs.length ? dirs : ["."], opts));

const home = program
  .command("home")
  .description("Manage secrets in your home directory");

home
  .command("init")
  .description("Detect and configure home directory secrets")
  .option("--force", "Overwrite existing home config")
  .hook("preAction", (thisCommand) => requireSession(thisCommand))
  .action(homeInitCommand);

home
  .command("list")
  .description("Show currently managed home files")
  .action(homeListCommand);

home
  .command("scan")
  .description("Scan $HOME for well-known secret files")
  .option("--dry-run", "Show detected files without changing config (default)")
  .option("--update", "Add newly detected files to home config")
  .action(homeScanCommand);

home
  .command("add")
  .description("Add a file to home config")
  .argument("<file>", "File path relative to $HOME (or ~/path)")
  .option("--machine", "Mark as machine-specific")
  .action(homeAddCommand);

home
  .command("remove")
  .description("Remove a file from home config")
  .argument("<file>", "File path relative to $HOME (or ~/path)")
  .action(homeRemoveCommand);

home
  .command("ignore")
  .description("Manage ignore patterns for home scan")
  .argument("[pattern]", "Glob pattern to ignore (e.g. .config/ or .ssh/id_*)")
  .option("--remove", "Remove the pattern instead of adding it")
  .option("--list", "Show current ignore patterns")
  .action(homeIgnoreCommand);

home
  .command("save")
  .description("Save home secrets to Bitwarden")
  .option("--dry-run", "Show what would be saved without writing to Bitwarden")
  .hook("preAction", (thisCommand) => requireSession(thisCommand))
  .action(homeSaveCommand);

home
  .command("restore")
  .description("Restore home secrets from Bitwarden")
  .option("--dry-run", "Show what would be restored without writing files")
  .option("--force", "Overwrite existing local files")
  .hook("preAction", (thisCommand) => requireSession(thisCommand))
  .action(homeRestoreCommand);

program.parse();
