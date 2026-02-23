import { homedir } from "node:os";
import { resolve } from "node:path";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import YAML from "yaml";
import type { BwrssConfig } from "../types/index.ts";
import { validateConfig } from "./config.ts";
import { ConfigError } from "../util/errors.ts";

const CONFIG_DIR = resolve(homedir(), ".config", "bwrss");
const HOME_CONFIG_PATH = resolve(CONFIG_DIR, "home.yaml");

/**
 * Path to the home secrets config file.
 */
export function homeConfigPath(): string {
  return HOME_CONFIG_PATH;
}

/**
 * Check if home.yaml exists.
 */
export async function homeConfigExists(): Promise<boolean> {
  return access(HOME_CONFIG_PATH).then(() => true, () => false);
}

/**
 * Read and validate the home secrets config.
 */
export async function readHomeConfig(): Promise<BwrssConfig> {
  if (!(await homeConfigExists())) {
    throw new ConfigError(`No home config found at ${HOME_CONFIG_PATH}`);
  }
  const text = await readFile(HOME_CONFIG_PATH, "utf-8");
  const parsed = YAML.parse(text);
  return validateConfig(parsed);
}

/**
 * Write the home secrets config.
 * Serializes `ignoredFiles` as `ignored-files` in YAML for readability.
 */
export async function writeHomeConfig(config: BwrssConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  // Convert to YAML-friendly object with kebab-case keys
  const obj: Record<string, unknown> = {
    version: config.version,
    name: config.name,
    files: config.files,
  };
  if (config.ignoredFiles && config.ignoredFiles.length > 0) {
    obj["ignored-files"] = config.ignoredFiles;
  }
  const text = YAML.stringify(obj, { indent: 2 });
  await writeFile(HOME_CONFIG_PATH, text, "utf-8");
}

/**
 * Resolve a path relative to $HOME to an absolute path.
 */
export function resolveHomePath(relativePath: string): string {
  return resolve(homedir(), relativePath);
}
