import { BitwardenError } from "../util/errors.ts";
import type { BwItem } from "../types/index.ts";

/**
 * Run a `bw` CLI command and return stdout.
 */
async function bw(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["bw", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new BitwardenError(`bw ${args.join(" ")} failed (exit ${exitCode}): ${stderr.trim()}`);
  }
  return stdout.trim();
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
  await Bun.write(tmpPath, content);
  try {
    await bw("create", "attachment", "--file", tmpPath, "--itemid", itemId);
  } finally {
    await Bun.file(tmpPath).exists().then((exists) => {
      if (exists) Bun.spawn(["rm", tmpPath]);
    });
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
