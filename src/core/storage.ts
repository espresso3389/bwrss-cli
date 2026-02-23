import type { BwrssMetadata, BwrssPayload, FilePayload } from "../types/index.ts";

const ATTACHMENT_FILENAME = "bwrss-data.json";

/**
 * Build the metadata JSON to store in the secure note's `notes` field.
 */
export function buildMetadata(name: string, files: FilePayload[]): string {
  const meta: BwrssMetadata = {
    version: 1,
    name,
    timestamp: new Date().toISOString(),
    files: files.map((f) => f.path),
  };
  return JSON.stringify(meta, null, 2);
}

/**
 * Build the full payload JSON to store as an attachment.
 */
export function buildPayload(name: string, files: FilePayload[]): string {
  const payload: BwrssPayload = {
    version: 1,
    name,
    timestamp: new Date().toISOString(),
    files,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse a payload JSON string.
 */
export function parsePayload(json: string): BwrssPayload {
  return JSON.parse(json);
}

/**
 * The attachment filename used for storing secret data.
 */
export { ATTACHMENT_FILENAME };
