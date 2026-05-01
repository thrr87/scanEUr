import type {
  Alternative,
  Fingerprint,
  ValidationIssue,
  ValidationResult,
  VendorProfile
} from "@scaneur/types";

export type VendorDatabase = {
  vendors: VendorProfile[];
};

export type FingerprintDatabase = {
  fingerprints: Fingerprint[];
};

export type AlternativesDatabase = {
  alternatives: Alternative[];
};

export function validateVendorDatabase(input: unknown): ValidationResult<VendorDatabase>;
export function validateFingerprintDatabase(input: unknown): ValidationResult<FingerprintDatabase>;
export function validateAlternativesDatabase(input: unknown): ValidationResult<AlternativesDatabase>;
export function formatRuleValidationErrors(errors: ValidationIssue[]): string;

export function assertVendorDatabase(input: unknown): VendorDatabase;
export function assertFingerprintDatabase(input: unknown): FingerprintDatabase;
export function assertAlternativesDatabase(input: unknown): AlternativesDatabase;

export type VendorMatch = {
  kind: "vendor";
  vendor: VendorProfile;
  ruleId: string;
};

export type FingerprintMatch = {
  kind: "fingerprint";
  fingerprint: Fingerprint;
  vendor: VendorProfile | null;
  ruleId: string;
};

export type EvidenceCandidateLike = {
  evidence_type: string;
  normalized_value: string;
  source_type?: string;
  metadata?: Record<string, unknown>;
};

export type VendorMatcher = {
  vendorDatabase: VendorDatabase;
  fingerprintDatabase: FingerprintDatabase;
  indexes: {
    vendorsById: Map<string, VendorProfile>;
  };
  matchCandidate(candidate: EvidenceCandidateLike): Array<VendorMatch | FingerprintMatch>;
};

export function loadVendorDatabase(rootPath?: string): Promise<VendorDatabase>;
export function loadFingerprintDatabase(rootPath?: string): Promise<FingerprintDatabase>;
export function loadAlternativesDatabase(rootPath?: string): Promise<AlternativesDatabase>;
export function buildVendorLookupIndexes(vendorDatabase: unknown): {
  vendorsById: Map<string, VendorProfile>;
};
export function createVendorMatcher(input: {
  vendorDatabase: unknown;
  fingerprintDatabase?: unknown;
}): VendorMatcher;

export const ruleSchemas: {
  vendorDatabase: {
    validate: typeof validateVendorDatabase;
    assert: typeof assertVendorDatabase;
  };
  fingerprintDatabase: {
    validate: typeof validateFingerprintDatabase;
    assert: typeof assertFingerprintDatabase;
  };
  alternativesDatabase: {
    validate: typeof validateAlternativesDatabase;
    assert: typeof assertAlternativesDatabase;
  };
};
