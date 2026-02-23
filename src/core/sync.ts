import type { Ora } from "ora";
import type { BwrssConfig, FilePayload } from "../types/index.ts";
import {
  findBwrssItem,
  findBwrssItemForMachine,
  createSecureNote,
  updateItemNotes,
  setAttachment,
  getAttachment,
} from "./bitwarden.ts";
import { buildMetadata, buildPayload, parsePayload, ATTACHMENT_FILENAME } from "./storage.ts";

/**
 * Split file payloads into shared and machine-specific groups.
 */
export function splitByMachine(
  config: BwrssConfig,
  payloads: FilePayload[],
): { shared: FilePayload[]; machine: FilePayload[] } {
  const machineFiles = new Set(
    config.files.filter((f) => f.machine).map((f) => f.path),
  );

  const shared: FilePayload[] = [];
  const machine: FilePayload[] = [];

  for (const p of payloads) {
    if (machineFiles.has(p.path)) {
      machine.push(p);
    } else {
      shared.push(p);
    }
  }

  return { shared, machine };
}

/**
 * Merge shared and machine-specific payloads. Machine payloads take
 * precedence when both contain the same path.
 */
export function mergePayloads(shared: FilePayload[], machine: FilePayload[]): FilePayload[] {
  const machineByPath = new Map(machine.map((p) => [p.path, p]));
  const merged: FilePayload[] = [];

  for (const p of shared) {
    if (machineByPath.has(p.path)) {
      merged.push(machineByPath.get(p.path)!);
      machineByPath.delete(p.path);
    } else {
      merged.push(p);
    }
  }

  // Append remaining machine-only files
  for (const p of machineByPath.values()) {
    merged.push(p);
  }

  return merged;
}

/**
 * Upload a payload to a Bitwarden secure note (find-or-create).
 */
export async function uploadPayload(
  itemName: string,
  canonicalName: string,
  payloads: FilePayload[],
  spinner: Ora,
): Promise<void> {
  const metadata = buildMetadata(canonicalName, payloads);
  const payload = buildPayload(canonicalName, payloads);

  let item = await findBwrssItem(canonicalName);

  if (item) {
    spinner.text = `Updating existing note ${itemName}...`;
    item = await updateItemNotes(item, metadata);
  } else {
    spinner.text = `Creating new note ${itemName}...`;
    item = await createSecureNote(itemName, metadata);
  }

  spinner.text = `Uploading attachment to ${itemName}...`;
  await setAttachment(item.id, ATTACHMENT_FILENAME, payload);
}

/**
 * Upload a machine-specific payload to `bwrss:<name>@<machine>`.
 */
export async function uploadMachinePayload(
  canonicalName: string,
  machineName: string,
  payloads: FilePayload[],
  spinner: Ora,
): Promise<void> {
  const itemName = `bwrss:${canonicalName}@${machineName}`;
  const metadata = buildMetadata(canonicalName, payloads);
  const payload = buildPayload(canonicalName, payloads);

  let item = await findBwrssItemForMachine(canonicalName, machineName);

  if (item) {
    spinner.text = `Updating existing note ${itemName}...`;
    item = await updateItemNotes(item, metadata);
  } else {
    spinner.text = `Creating new note ${itemName}...`;
    item = await createSecureNote(itemName, metadata);
  }

  spinner.text = `Uploading attachment to ${itemName}...`;
  await setAttachment(item.id, ATTACHMENT_FILENAME, payload);
}

/**
 * Fetch a shared payload from `bwrss:<name>`.
 */
export async function fetchPayload(canonicalName: string): Promise<FilePayload[] | null> {
  const item = await findBwrssItem(canonicalName);
  if (!item) return null;

  const attachment = item.attachments?.find((a) => a.fileName === ATTACHMENT_FILENAME);
  if (!attachment) return null;

  const json = await getAttachment(item.id, attachment.id);
  const payload = parsePayload(json);
  return payload.files;
}

/**
 * Fetch a machine-specific payload from `bwrss:<name>@<machine>`.
 */
export async function fetchMachinePayload(
  canonicalName: string,
  machineName: string,
): Promise<FilePayload[] | null> {
  const item = await findBwrssItemForMachine(canonicalName, machineName);
  if (!item) return null;

  const attachment = item.attachments?.find((a) => a.fileName === ATTACHMENT_FILENAME);
  if (!attachment) return null;

  const json = await getAttachment(item.id, attachment.id);
  const payload = parsePayload(json);
  return payload.files;
}
