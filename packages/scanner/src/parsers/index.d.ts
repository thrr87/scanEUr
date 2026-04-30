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

export function parseEvidenceCandidates(input: ParseEvidenceInput): ParserResult;
export const parseContent: typeof parseEvidenceCandidates;
