import { stat, chmod } from "node:fs/promises";

/**
 * Read the permission mode bits of a file.
 */
export async function getFileMode(path: string): Promise<number> {
  const s = await stat(path);
  return s.mode & 0o7777;
}

/**
 * Set the permission mode bits of a file.
 */
export async function setFileMode(path: string, mode: number): Promise<void> {
  await chmod(path, mode);
}

/**
 * Format a numeric mode as an octal string, e.g. "0600".
 */
export function modeToString(mode: number): string {
  return mode.toString(8).padStart(4, "0");
}
