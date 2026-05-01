import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatRuleValidationErrors,
  loadAlternativesDatabase,
  loadFingerprintDatabase,
  loadVendorDatabase,
  validateAlternativesDatabase,
  validateFingerprintDatabase,
  validateVendorDatabase
} from "../src/index.js";
import {
  validAlternative,
  validFingerprint,
  validVendorProfile
} from "../../types/test/fixtures.mjs";
import {
  validateSeedCollections,
  validateSeedDatabase
} from "../../../scripts/validate-database.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function clone(value) {
  return structuredClone(value);
}

function assertInvalid(label, result, expectedPath, expectedText) {
  assert.equal(result.success, false, `${label} should be invalid`);
  const formatted = formatRuleValidationErrors(result.errors);
  assert.match(formatted, new RegExp(expectedPath.replaceAll(".", "\\.")), formatted);
  assert.match(formatted, new RegExp(expectedText), formatted);
}

const vendors = await loadVendorDatabase(repoRoot);
const fingerprints = await loadFingerprintDatabase(repoRoot);
const alternatives = await loadAlternativesDatabase(repoRoot);

assert.equal(Array.isArray(vendors.vendors), true);
assert.equal(Array.isArray(fingerprints.fingerprints), true);
assert.equal(Array.isArray(alternatives.alternatives), true);
assert.ok(vendors.vendors.length >= 8, "repository seed database should include common vendor profiles");
assert.ok(fingerprints.fingerprints.length >= 8, "repository seed database should include common fingerprints");
assert.ok(alternatives.alternatives.length >= 6, "repository seed database should include initial alternatives");

const seedValidation = await validateSeedDatabase(repoRoot);
assert.equal(
  seedValidation.success,
  true,
  `repository seed database should pass governance validation:\n${formatRuleValidationErrors(seedValidation.errors)}`
);

const promotedFingerprintDatabase = clone(fingerprints);
promotedFingerprintDatabase.fingerprints[0].verification_status = "partially_verified";
assertInvalid(
  "seed fingerprint promoted without review metadata",
  validateSeedCollections(vendors, promotedFingerprintDatabase, alternatives),
  "fingerprints\\[0\\].verification_status",
  "agent_draft"
);

const alternativeControlClaimDatabase = clone(alternatives);
alternativeControlClaimDatabase.alternatives[0].control_notes.eu_or_european_control_signal = "high";
assertInvalid(
  "seed alternative control claim without review metadata",
  validateSeedCollections(vendors, fingerprints, alternativeControlClaimDatabase),
  "alternatives\\[0\\].control_notes",
  "human review"
);

const verifiedWithoutReviewDate = clone(validVendorProfile);
verifiedWithoutReviewDate.verification.status = "verified";
verifiedWithoutReviewDate.evidence_sources = [
  {
    title: "Fixture docs",
    url: "https://example.invalid/docs",
    source_type: "official",
    supports: ["Fixture database validation only."],
    retrieved_at: "2026-04-30"
  }
];
assertInvalid(
  "verified database profile without review date",
  validateVendorDatabase({ vendors: [verifiedWithoutReviewDate] }),
  "vendors\\[0\\].verification.last_reviewed",
  "concrete last_reviewed date"
);

const duplicateFingerprint = clone(validFingerprint);
duplicateFingerprint.result.evidence_label = "Duplicate fingerprint fixture";
assertInvalid(
  "duplicate fingerprint IDs",
  validateFingerprintDatabase({ fingerprints: [validFingerprint, duplicateFingerprint] }),
  "fingerprints\\[1\\].id",
  "duplicate id"
);

const affiliateAlternative = clone(validAlternative);
affiliateAlternative.ranking.affiliate_link = true;
assertInvalid(
  "affiliate alternative database entry",
  validateAlternativesDatabase({ alternatives: [affiliateAlternative] }),
  "alternatives\\[0\\].ranking.affiliate_link",
  "affiliate links are not allowed"
);

console.log("Repository database validation fixtures passed.");
