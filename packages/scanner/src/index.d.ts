import type { FileScanned, FileSkipped, Finding } from "@scaneur/types";
import type { VendorDatabase, FingerprintDatabase, VendorMatcher } from "@scaneur/rules";

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

export type EvidenceCandidate = {
  source_file: string;
  source_type: string;
  evidence_type:
    | "package_name"
    | "env_var"
    | "domain"
    | "docker_image"
    | "github_action"
    | "config_file"
    | "terraform_provider"
    | "text_pattern";
  raw_value_safe: string;
  normalized_value: string;
  parser: string;
  confidence_hint: "low" | "medium" | "high" | "unknown";
  line_number: number | null;
  redacted: boolean;
  metadata?: Record<string, unknown>;
};

export type ParserResult = {
  evidence_candidates: EvidenceCandidate[];
  parser_warnings: Array<{
    path: string;
    parser: string;
    message: string;
  }>;
};

export type ParseEvidenceInput = {
  source_file?: string;
  path?: string;
  source_type?: string;
  file_type?: string;
  parser?: string;
  content: string;
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
export function parseEvidenceCandidates(input: ParseEvidenceInput): ParserResult;
export const parseContent: typeof parseEvidenceCandidates;
export function parseDiscoveredFile(targetPath: string, scannedFile: FileScanned): Promise<ParserResult>;
export function matchEvidenceCandidates(
  evidenceCandidates: EvidenceCandidate[],
  options:
    | VendorMatcher
    | {
        vendorDatabase: VendorDatabase;
        fingerprintDatabase?: FingerprintDatabase;
      }
): Finding[];
