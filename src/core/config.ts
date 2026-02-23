import { resolve } from "path";
import YAML from "yaml";
import type { BwrssConfig } from "../types/index.ts";
import { ConfigError } from "../util/errors.ts";

const CONFIG_FILENAME = ".bwrss";

export function configPath(repoRoot: string): string {
  return resolve(repoRoot, CONFIG_FILENAME);
}

/**
 * Check if a .bwrss config exists in the repo.
 */
export async function configExists(repoRoot: string): Promise<boolean> {
  return Bun.file(configPath(repoRoot)).exists();
}

/**
 * Read and parse the .bwrss config file.
 */
export async function readConfig(repoRoot: string): Promise<BwrssConfig> {
  const path = configPath(repoRoot);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new ConfigError(`No .bwrss config found at ${path}`);
  }
  const text = await file.text();
  const parsed = YAML.parse(text);
  return validateConfig(parsed);
}

/**
 * Write a .bwrss config file.
 */
export async function writeConfig(repoRoot: string, config: BwrssConfig): Promise<void> {
  const path = configPath(repoRoot);
  const text = YAML.stringify(config, { indent: 2 });
  await Bun.write(path, text);
}

/**
 * Validate parsed config object.
 */
function validateConfig(obj: unknown): BwrssConfig {
  if (!obj || typeof obj !== "object") {
    throw new ConfigError("Invalid .bwrss config: not an object");
  }
  const config = obj as Record<string, unknown>;

  if (config.version !== 1) {
    throw new ConfigError(`Unsupported .bwrss config version: ${config.version}`);
  }

  if (!Array.isArray(config.files)) {
    throw new ConfigError("Invalid .bwrss config: 'files' must be an array");
  }

  for (const file of config.files) {
    if (!file || typeof file !== "object" || typeof file.path !== "string") {
      throw new ConfigError("Invalid .bwrss config: each file must have a 'path' string");
    }
    if (file.keys !== undefined && !Array.isArray(file.keys)) {
      throw new ConfigError(`Invalid .bwrss config: 'keys' for ${file.path} must be an array`);
    }
  }

  return {
    version: 1,
    name: typeof config.name === "string" ? config.name : undefined,
    files: config.files.map((f: { path: string; keys?: string[] }) => ({
      path: f.path,
      ...(f.keys ? { keys: f.keys } : {}),
    })),
  };
}
