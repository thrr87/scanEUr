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
