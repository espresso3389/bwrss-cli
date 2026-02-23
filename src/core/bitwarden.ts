import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { BitwardenError } from "../util/errors.ts";
import type { BwItem, MachineInfo } from "../types/index.ts";

/**
 * Run a `bw` CLI command and return stdout.
 */
async function bw(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("bw", args, { env: process.env, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new BitwardenError(`bw ${args.join(" ")} failed (exit ${error.code}): ${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Ensure a BW_SESSION is available. Call this before any `bw` command.
 * If `session` is provided (from --bw-session), sets it in the environment.
 * Throws if no session is found.
 */
export function ensureSession(session?: string): void {
  if (session) {
    process.env.BW_SESSION = session;
  }
  if (!process.env.BW_SESSION) {
    throw new BitwardenError(
      "No Bitwarden session found. Run 'bw unlock' and export BW_SESSION, or pass --bw-session.",
    );
  }
}

/**
 * Check that `bw` is available and the vault is unlocked.
 */
export async function ensureUnlocked(): Promise<void> {
  try {
    const status = await bw("status");
    const parsed = JSON.parse(status);
    if (parsed.status !== "unlocked") {
      throw new BitwardenError(
        `Bitwarden vault is ${parsed.status}. Run 'bw unlock' first and export BW_SESSION.`,
      );
    }
  } catch (e) {
    if (e instanceof BitwardenError) throw e;
    throw new BitwardenError("'bw' CLI not found or not working. Install it from https://bitwarden.com/help/cli/");
  }
}

/**
 * Sync the local Bitwarden cache.
 */
export async function sync(): Promise<void> {
  await bw("sync");
}

/**
 * Search for items by name.
 */
export async function searchItems(name: string): Promise<BwItem[]> {
  const output = await bw("list", "items", "--search", name);
  return JSON.parse(output);
}

/**
 * Get a single item by ID.
 */
export async function getItem(id: string): Promise<BwItem> {
  const output = await bw("get", "item", id);
  return JSON.parse(output);
}

/**
 * Create a secure note item and return it.
 */
export async function createSecureNote(name: string, notes: string): Promise<BwItem> {
  const template = {
    type: 2, // secure note
    name,
    notes,
    secureNote: { type: 0 },
  };
  const encoded = Buffer.from(JSON.stringify(template)).toString("base64");
  const output = await bw("create", "item", encoded);
  return JSON.parse(output);
}

/**
 * Update the notes field of an existing item.
 */
export async function updateItemNotes(item: BwItem, notes: string): Promise<BwItem> {
  const updated = { ...item, notes };
  const encoded = Buffer.from(JSON.stringify(updated)).toString("base64");
  const output = await bw("edit", "item", item.id, encoded);
  return JSON.parse(output);
}

/**
 * Create or replace an attachment on an item.
 */
export async function setAttachment(itemId: string, fileName: string, content: string): Promise<void> {
  // First remove existing attachment with same name if present
  const item = await getItem(itemId);
  const existing = item.attachments?.find((a) => a.fileName === fileName);
  if (existing) {
    await bw("delete", "attachment", existing.id, "--itemid", itemId);
  }

  // Write to temp file, attach, clean up
  const tmpPath = `/tmp/bwrss-${Date.now()}-${fileName}`;
  await writeFile(tmpPath, content, "utf-8");
  try {
    await bw("create", "attachment", "--file", tmpPath, "--itemid", itemId);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Download an attachment and return its content.
 */
export async function getAttachment(itemId: string, attachmentId: string): Promise<string> {
  const output = await bw("get", "attachment", attachmentId, "--itemid", itemId, "--raw");
  return output;
}

/**
 * Find a bwrss secure note by canonical name.
 */
export async function findBwrssItem(canonicalName: string): Promise<BwItem | null> {
  const searchName = `bwrss:${canonicalName}`;
  const items = await searchItems(searchName);
  return items.find((i) => i.name === searchName) ?? null;
}

/**
 * Find a machine-specific bwrss secure note: `bwrss:<name>@<machine>`.
 */
export async function findBwrssItemForMachine(canonicalName: string, machineName: string): Promise<BwItem | null> {
  const searchName = `bwrss:${canonicalName}@${machineName}`;
  const items = await searchItems(searchName);
  return items.find((i) => i.name === searchName) ?? null;
}

/**
 * Discover all known machines by searching Bitwarden for `bwrss:*@*` items.
 * Extracts machine names and last save timestamps from item metadata.
 */
export async function discoverMachines(): Promise<MachineInfo[]> {
  const items = await searchItems("bwrss:");
  const machineMap = new Map<string, string>();

  for (const item of items) {
    const atIdx = item.name.indexOf("@");
    if (atIdx === -1) continue;

    const machineName = item.name.slice(atIdx + 1);
    if (!machineName) continue;

    // Parse timestamp from notes metadata
    let timestamp = "";
    if (item.notes) {
      try {
        const meta = JSON.parse(item.notes);
        timestamp = meta.timestamp ?? "";
      } catch {
        // invalid metadata
      }
    }

    // Keep the most recent timestamp per machine
    const existing = machineMap.get(machineName);
    if (!existing || timestamp > existing) {
      machineMap.set(machineName, timestamp);
    }
  }

  return Array.from(machineMap.entries())
    .map(([name, lastSave]) => ({ name, lastSave }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
