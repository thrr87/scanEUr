import type { FileScanned, FileSkipped } from "@scaneur/types";

export type FileDiscoveryOptions = {
  ignoredDirectories?: string[];
  includeDirectories?: string[];
  maxFileBytes?: number;
};

export type FileDiscoveryResult = {
  target_path: string;
  files_scanned: FileScanned[];
  files_skipped: FileSkipped[];
};

export const DEFAULT_MAX_FILE_BYTES: number;
export const DEFAULT_IGNORED_DIRECTORIES: readonly string[];
export const APPROVED_ENV_TEMPLATES: readonly string[];

export function isSensitiveFile(filePath: string): boolean;
export function discoverFiles(
  targetPath: string,
  options?: FileDiscoveryOptions
): Promise<FileDiscoveryResult>;
export const discoverSupportedFiles: typeof discoverFiles;
