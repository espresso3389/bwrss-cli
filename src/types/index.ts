/** .bwrss config file schema */
export interface BwrssConfig {
  version: number;
  name?: string;
  files: ManagedFile[];
  /** Glob patterns for files/directories to ignore during scan */
  ignoredFiles?: string[];
}

export interface ManagedFile {
  path: string;
  keys?: string[];
  /** If true, this file is stored per-machine rather than shared */
  machine?: boolean;
}

/** Machine-level config stored at ~/.config/bwrss/config.yaml */
export interface MachineConfig {
  machine?: string;
}

/** A known machine discovered from Bitwarden */
export interface MachineInfo {
  name: string;
  lastSave: string;
}

/** Payload stored in Bitwarden attachment */
export interface BwrssPayload {
  version: number;
  name: string;
  timestamp: string;
  files: FilePayload[];
}

export interface FilePayload {
  path: string;
  /** Present for full-file management */
  content?: string;
  /** Present for partial key management */
  keys?: Record<string, string>;
  /** File permission mode (e.g. 0o600) — captured on save, restored on restore */
  mode?: number;
  /** Content encoding — "base64" for binary files, defaults to "utf-8" */
  encoding?: "utf-8" | "base64";
}

/** Metadata stored in BW secure note's `notes` field */
export interface BwrssMetadata {
  version: number;
  name: string;
  timestamp: string;
  files: string[];
}

/** Result from scanning a repo */
export interface ScanResult {
  repoPath: string;
  canonicalName: string;
  hasBwrss: boolean;
  secretFiles: string[];
  managedFiles: string[];
}

/** Parser interface for different file formats */
export interface FileParser {
  /** File extensions this parser handles */
  extensions: string[];
  /** Parse a file and return all key-value pairs as flat dot-paths */
  parse(content: string): Record<string, string>;
  /** Extract only matching keys from content */
  extract(content: string, patterns: string[]): Record<string, string>;
  /** Merge keys into existing content, preserving structure */
  merge(existingContent: string, keys: Record<string, string>): string;
}

/** Bitwarden item as returned by `bw` CLI */
export interface BwItem {
  id: string;
  name: string;
  type: number;
  notes?: string;
  secureNote?: { type: number };
  attachments?: BwAttachment[];
}

export interface BwAttachment {
  id: string;
  fileName: string;
  size: string;
}
