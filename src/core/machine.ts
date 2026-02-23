import { homedir } from "node:os";
import { resolve } from "node:path";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import ora from "ora";
import YAML from "yaml";
import type { MachineConfig } from "../types/index.ts";
import { discoverMachines } from "./bitwarden.ts";
import { ConfigError } from "../util/errors.ts";

const CONFIG_DIR = resolve(homedir(), ".config", "bwrss");
const CONFIG_PATH = resolve(CONFIG_DIR, "config.yaml");

/**
 * Read the global machine config (~/.config/bwrss/config.yaml).
 * Returns an empty config if the file doesn't exist.
 */
export async function readMachineConfig(): Promise<MachineConfig> {
  const exists = await access(CONFIG_PATH).then(() => true, () => false);
  if (!exists) return {};

  const text = await readFile(CONFIG_PATH, "utf-8");
  const parsed = YAML.parse(text);
  if (!parsed || typeof parsed !== "object") return {};

  return {
    machine: typeof parsed.machine === "string" ? parsed.machine : undefined,
  };
}

/**
 * Write the global machine config.
 */
export async function writeMachineConfig(config: MachineConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const text = YAML.stringify(config, { indent: 2 });
  await writeFile(CONFIG_PATH, text, "utf-8");
}

/**
 * Get the current machine name, prompting interactively if not set.
 * Queries Bitwarden to show known machines — requires an unlocked vault.
 */
export async function getMachineName(): Promise<string> {
  const config = await readMachineConfig();
  if (config.machine) return config.machine;
  return promptMachineName();
}


/**
 * Always show the machine chooser — fetches known machines from Bitwarden,
 * highlights the current machine if set, and lets the user pick or type a new name.
 * Persists the choice to config.yaml.
 */
export async function chooseMachineName(): Promise<string> {
  const config = await readMachineConfig();
  const current = config.machine;
  const rl = createInterface({ input: process.stdin, output: process.stderr });

  try {
    const spinner = ora("Fetching known machines from Bitwarden...").start();
    const machines = await discoverMachines();
    spinner.stop();

    if (machines.length > 0) {
      console.error(chalk.bold("\nKnown machines (from Bitwarden):"));
      for (let i = 0; i < machines.length; i++) {
        const age = machines[i].lastSave ? formatTimestamp(machines[i].lastSave) : "never";
        const marker = machines[i].name === current ? chalk.green(" *") : "";
        console.error(`  ${i + 1}) ${machines[i].name}${marker}` + chalk.dim(` (last save: ${age})`));
      }
      if (current) {
        console.error(chalk.dim(`\n  * = current machine`));
      }
      console.error();

      const prompt = current
        ? `Select a machine number or type a new name [${current}]: `
        : "Select a machine number or type a new name: ";
      const answer = await rl.question(prompt);

      // Enter with no input → keep current
      if (!answer.trim() && current) {
        return current;
      }

      const num = parseInt(answer, 10);
      if (num >= 1 && num <= machines.length) {
        const name = machines[num - 1].name;
        await writeMachineConfig({ machine: name });
        return name;
      }

      const name = answer.trim();
      if (!name) throw new ConfigError("Machine name cannot be empty.");
      await writeMachineConfig({ machine: name });
      return name;
    }

    // No known machines in Bitwarden
    const prompt = current
      ? `Enter a name for this machine [${current}]: `
      : "Enter a name for this machine: ";
    const answer = (await rl.question(`\n${prompt}`)).trim();

    // Enter with no input → keep current
    if (!answer && current) {
      return current;
    }

    if (!answer) throw new ConfigError("Machine name cannot be empty.");
    await writeMachineConfig({ machine: answer });
    return answer;
  } finally {
    rl.close();
  }
}

/**
 * Prompt for machine name (used when no machine name is configured).
 * Same as chooseMachineName but only called when config has no name set.
 */
async function promptMachineName(): Promise<string> {
  return chooseMachineName();
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}
