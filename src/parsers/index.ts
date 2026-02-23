import { extname } from "path";
import type { FileParser } from "../types/index.ts";
import { iniParser } from "./ini.ts";
import { jsonParser } from "./json.ts";
import { yamlParser } from "./yaml.ts";
import { tomlParser } from "./toml.ts";

const parsers: FileParser[] = [iniParser, jsonParser, yamlParser, tomlParser];

/**
 * Get the appropriate parser for a file path based on extension.
 * Files matching `.env*` pattern use the INI parser.
 */
export function getParser(filePath: string): FileParser | null {
  const base = filePath.split("/").pop() ?? "";

  // .env files (with any suffix) use INI parser
  if (base.startsWith(".env")) {
    return iniParser;
  }

  const ext = extname(filePath).toLowerCase();
  return parsers.find((p) => p.extensions.includes(ext)) ?? null;
}

export { iniParser, jsonParser, yamlParser, tomlParser };
