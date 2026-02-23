#!/usr/bin/env bun
import { Command } from "commander";
import { scanCommand } from "./commands/scan.ts";
import { initCommand } from "./commands/init.ts";
import { saveCommand } from "./commands/save.ts";
import { restoreCommand } from "./commands/restore.ts";

const program = new Command();

program
  .name("bwrss")
  .description("Bitwarden Repository Settings Sync — manage git repo secrets via Bitwarden")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan directories for repos with secret files")
  .argument("<dirs...>", "Directories to scan")
  .action(scanCommand);

program
  .command("init")
  .description("Create .bwrss config for repos")
  .argument("<dirs...>", "Repo directories to initialize")
  .option("--force", "Overwrite existing .bwrss config")
  .action(initCommand);

program
  .command("save")
  .description("Save secrets to Bitwarden")
  .argument("<dirs...>", "Repo directories to save")
  .option("--dry-run", "Show what would be saved without writing to Bitwarden")
  .action(saveCommand);

program
  .command("restore")
  .description("Restore secrets from Bitwarden")
  .argument("<dirs...>", "Repo directories to restore")
  .option("--dry-run", "Show what would be restored without writing files")
  .option("--force", "Overwrite existing local files")
  .action(restoreCommand);

program.parse();
