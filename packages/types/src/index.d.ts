export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult<T> =
  | { success: true; data: T; errors: [] }
  | { success: false; errors: ValidationIssue[] };

export type VerificationStatus =
  | "verified"
  | "partially_verified"
  | "fingerprint_only"
  | "agent_draft"
  | "unknown";

export type AlternativeVerificationStatus =
  | "verified"
  | "partially_verified"
  | "agent_draft"
  | "unknown";

export type JurisdictionRegion = "EU" | "EEA" | "Europe_non_EU" | "US" | "UK" | "Other" | "Unknown";
export type ControlRegion = JurisdictionRegion | "Mixed";
export type TriState = true | false | "unknown";
export type SeverityScore = "low" | "medium" | "high" | "critical" | "unknown";
export type MaturityScore = "low" | "medium" | "high" | "unknown";
export type EvidenceConfidenceScore = "low" | "medium" | "high" | "unknown";
export type PersonalDataLevel = "low" | "medium" | "high" | "unknown";

export type RecommendationCategory =
  | "replace_now"
  | "configure_better"
  | "review_contractually"
  | "monitor"
  | "keep_for_now"
  | "strategic_migration_only"
  | "manual_review_required";

export type EvidenceSourceType = "official" | "documentation" | "legal" | "registry" | "other";
export type AlternativeEvidenceSourceType = "official" | "documentation" | "other";

export type ScoreDimensions = {
  jurisdiction_signal: SeverityScore;
  data_sensitivity_signal: SeverityScore;
  operational_criticality: SeverityScore;
  migration_effort: SeverityScore;
  alternative_maturity: MaturityScore;
  evidence_confidence: EvidenceConfidenceScore;
};

export type EvidenceSource = {
  title: string;
  url: string;
  source_type: EvidenceSourceType;
  supports: string[];
  retrieved_at: string | "unknown";
};

export type VendorProfile = {
  id: string;
  name: string;
  category: string;
  secondary_categories: string[];
  aliases: string[];
  website: string;
  identifiers: {
    domains: string[];
    packages: {
      npm: string[];
      pypi: string[];
      other: string[];
    };
    env_patterns: string[];
    docker_images: string[];
    github_actions: string[];
    config_files: string[];
    terraform_providers: string[];
  };
  jurisdiction: {
    headquarters_country: string | "unknown";
    headquarters_region: JurisdictionRegion;
    eu_establishment: TriState;
    data_residency_options: string[];
    jurisdiction_notes: string;
  };
  ownership_control: {
    control_region: ControlRegion;
    parent_company: string | "unknown";
    publicly_traded: TriState;
    control_notes: string;
  };
  data_categories: {
    likely_personal_data: PersonalDataLevel;
    common_data_types: string[];
    sensitive_data_possible: TriState;
    data_notes: string;
  };
  common_use_cases: string[];
  operational_criticality_default: SeverityScore;
  migration_effort_default: SeverityScore;
  scoring_defaults: ScoreDimensions;
  recommendation_defaults: {
    categories: RecommendationCategory[];
    notes: string;
  };
  evidence_sources: EvidenceSource[];
  verification: {
    status: VerificationStatus;
    last_reviewed: string | "unknown";
    reviewed_by: string | "unknown";
    review_notes: string;
  };
  limitations: string[];
  notes: string;
  schema_version: string;
};

export type FingerprintRuleType =
  | "package"
  | "env_var"
  | "domain"
  | "docker_image"
  | "github_action"
  | "config_file"
  | "terraform_provider"
  | "text_pattern";

export type Fingerprint = {
  id: string;
  verification_status: "fingerprint_only" | "partially_verified" | "agent_draft";
  rule_type: FingerprintRuleType;
  match: Record<string, unknown>;
  result: {
    vendor_id: string | null;
    candidate_category?: string | null;
    confidence: EvidenceConfidenceScore;
    evidence_label: string;
    observed_fact?: string;
    inference?: string;
    manual_review_recommended?: boolean;
  };
  limitations: string[];
  schema_version: string;
};

export type AlternativeType =
  | "eu_saas"
  | "european_controlled"
  | "open_source"
  | "self_hosted"
  | "partial_replacement"
  | "configure_better"
  | "no_good_equivalent";

export type ReplacementType =
  | "full"
  | "partial"
  | "complementary"
  | "configuration_only"
  | "strategic_only"
  | "unknown";

export type Alternative = {
  id: string;
  source: {
    vendor_id: string | null;
    category: string;
    use_case: string | null;
  };
  alternative: {
    vendor_id: string | null;
    name: string;
    type: AlternativeType;
    website: string | null;
  };
  replacement: {
    replacement_type: ReplacementType;
    fit_level: MaturityScore;
    maturity: MaturityScore;
    migration_effort: SeverityScore;
    alternative_maturity: MaturityScore;
  };
  hosting: {
    self_hosting_option: TriState;
    managed_option: TriState;
    operational_burden: SeverityScore;
  };
  control_notes: {
    eu_or_european_control_signal: MaturityScore;
    data_residency_notes: string;
    ownership_notes: string;
  };
  usage_guidance: {
    best_fit_cases: string[];
    poor_fit_cases: string[];
    known_gaps: string[];
    migration_notes: string[];
    configuration_notes: string[];
  };
  ranking: {
    methodology_basis: string[];
    commercial_influence: "none";
    affiliate_link: false;
    sponsored: false;
  };
  evidence_sources: Array<Omit<EvidenceSource, "source_type"> & { source_type: AlternativeEvidenceSourceType }>;
  verification: {
    status: AlternativeVerificationStatus;
    last_reviewed: string | "unknown";
    reviewed_by: string | "unknown";
  };
  limitations: string[];
  schema_version: string;
};

export type SourceType =
  | "package_manifest"
  | "lockfile"
  | "env_template"
  | "config_file"
  | "workflow"
  | "dockerfile"
  | "terraform"
  | "text"
  | "unknown";

export type EvidenceType =
  | "package_name"
  | "env_var"
  | "domain"
  | "docker_image"
  | "github_action"
  | "config_file"
  | "terraform_provider"
  | "text_pattern";

export type EvidenceItem = {
  evidence_id: string;
  source_file: string;
  source_type: SourceType;
  evidence_type: EvidenceType;
  matched_value: string;
  matched_rule_id: string | null;
  confidence: EvidenceConfidenceScore;
  observed_fact: string;
  inference: string;
  line_number: number | null;
  redacted: boolean;
};

export type Finding = {
  finding_id: string;
  finding_type: "known_vendor" | "fingerprint_only";
  vendor_id: string | null;
  vendor_name: string;
  category: string;
  verification_status: VerificationStatus;
  scores: ScoreDimensions;
  recommendations: RecommendationCategory[];
  observed_facts: string[];
  inferences: string[];
  unknowns: string[];
  manual_review_recommended: boolean;
  evidence: EvidenceItem[];
  alternatives: Array<{
    alternative_id: string;
    name: string;
    replacement_type: ReplacementType;
    fit_level: MaturityScore;
    maturity: MaturityScore;
    migration_effort: SeverityScore;
    known_gaps: string[];
  }>;
  limitations: string[];
};

export type UnknownCandidate = {
  candidate_id: string;
  candidate_type:
    | "external_domain"
    | "env_prefix"
    | "github_action"
    | "docker_image"
    | "package"
    | "config_reference";
  normalized_value: string;
  source_files: string[];
  reason_flagged: string;
  evidence_confidence: EvidenceConfidenceScore;
  manual_review_recommended: boolean;
  unsupported_claims: string[];
  suggested_review_steps: string[];
};

export type FileScanned = {
  path: string;
  file_type: string;
  parser: string;
  status: "scanned";
};

export type FileSkipped = {
  path: string;
  reason:
    | "ignored_directory"
    | "unsupported_file_type"
    | "sensitive_file_default_skip"
    | "file_too_large"
    | "unreadable"
    | "user_excluded";
  configured_by_user: boolean;
};

export type ParserWarning = {
  path: string;
  parser: string;
  message: string;
};

export type ScanMetadata = {
  scanner_version: string;
  database_version: string;
  methodology_version: string;
  scan_started_at: string;
  scan_completed_at: string;
  scan_mode: string;
  target_path: string;
  files_scanned_count: number;
  files_skipped_count: number;
};

export type ScanSummary = {
  detected_vendor_count: number;
  unknown_candidate_count: number;
  high_priority_review_count: number;
  quick_win_count: number;
  strategic_dependency_count: number;
};

export type ScanResult = {
  schema_version: string;
  scan_metadata: ScanMetadata;
  summary: ScanSummary;
  findings: Finding[];
  unknown_candidates: UnknownCandidate[];
  files_scanned: FileScanned[];
  files_skipped: FileSkipped[];
  parser_warnings: ParserWarning[];
};

export type Report = ScanResult & {
  report_type: "scaneur_report";
  disclaimer: string;
};

export const VERIFICATION_STATUSES: readonly VerificationStatus[];
export const ALTERNATIVE_VERIFICATION_STATUSES: readonly AlternativeVerificationStatus[];
export const JURISDICTION_REGIONS: readonly JurisdictionRegion[];
export const CONTROL_REGIONS: readonly ControlRegion[];
export const TRI_STATE_VALUES: readonly TriState[];
export const SEVERITY_SCORES: readonly SeverityScore[];
export const MATURITY_SCORES: readonly MaturityScore[];
export const EVIDENCE_CONFIDENCE_SCORES: readonly EvidenceConfidenceScore[];
export const PERSONAL_DATA_LEVELS: readonly PersonalDataLevel[];
export const RECOMMENDATION_CATEGORIES: readonly RecommendationCategory[];
export const VENDOR_EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[];
export const ALTERNATIVE_EVIDENCE_SOURCE_TYPES: readonly AlternativeEvidenceSourceType[];
export const ALTERNATIVE_TYPES: readonly AlternativeType[];
export const REPLACEMENT_TYPES: readonly ReplacementType[];
export const FINGERPRINT_RULE_TYPES: readonly FingerprintRuleType[];
export const SOURCE_TYPES: readonly SourceType[];
export const EVIDENCE_TYPES: readonly EvidenceType[];
export const FINDING_TYPES: readonly Finding["finding_type"][];
export const UNKNOWN_CANDIDATE_TYPES: readonly UnknownCandidate["candidate_type"][];
export const FILE_SKIP_REASONS: readonly FileSkipped["reason"][];

export function validateScores(input: unknown): ValidationResult<ScoreDimensions>;
export function validateVendorProfile(input: unknown): ValidationResult<VendorProfile>;
export function validateFingerprint(input: unknown): ValidationResult<Fingerprint>;
export function validateAlternative(input: unknown): ValidationResult<Alternative>;
export function validateFinding(input: unknown): ValidationResult<Finding>;
export function validateScanResult(input: unknown): ValidationResult<ScanResult>;
export function validateReport(input: unknown): ValidationResult<Report>;
export function formatValidationErrors(errors: ValidationIssue[]): string;

export function assertScores(input: unknown): ScoreDimensions;
export function assertVendorProfile(input: unknown): VendorProfile;
export function assertFingerprint(input: unknown): Fingerprint;
export function assertAlternative(input: unknown): Alternative;
export function assertFinding(input: unknown): Finding;
export function assertScanResult(input: unknown): ScanResult;
export function assertReport(input: unknown): Report;

export const schemas: {
  scores: { validate: typeof validateScores; assert: typeof assertScores };
  vendorProfile: { validate: typeof validateVendorProfile; assert: typeof assertVendorProfile };
  fingerprint: { validate: typeof validateFingerprint; assert: typeof assertFingerprint };
  alternative: { validate: typeof validateAlternative; assert: typeof assertAlternative };
  finding: { validate: typeof validateFinding; assert: typeof assertFinding };
  scanResult: { validate: typeof validateScanResult; assert: typeof assertScanResult };
  report: { validate: typeof validateReport; assert: typeof assertReport };
};
