import assert from "node:assert/strict";

import {
  formatRuleValidationErrors,
  validateAlternativesDatabase,
  validateFingerprintDatabase,
  validateVendorDatabase
} from "../src/index.js";
import {
  validAlternative,
  validFingerprint,
  validVendorProfile
} from "../../types/test/fixtures.mjs";

function clone(value) {
  return structuredClone(value);
}

function assertValid(label, result) {
  assert.equal(
    result.success,
    true,
    `${label} should be valid:\n${result.success ? "" : formatRuleValidationErrors(result.errors)}`
  );
}

function assertInvalid(label, result, expectedPath, expectedText) {
  assert.equal(result.success, false, `${label} should be invalid`);
  const formatted = formatRuleValidationErrors(result.errors);
  assert.match(formatted, new RegExp(expectedPath.replaceAll(".", "\\.")), formatted);
  assert.match(formatted, new RegExp(expectedText), formatted);
}

assertValid("empty vendor database", validateVendorDatabase({ vendors: [] }));
assertValid("empty fingerprint database", validateFingerprintDatabase({ fingerprints: [] }));
assertValid("empty alternatives database", validateAlternativesDatabase({ alternatives: [] }));

assertValid("vendor database fixture", validateVendorDatabase({ vendors: [validVendorProfile] }));
assertValid("fingerprint database fixture", validateFingerprintDatabase({ fingerprints: [validFingerprint] }));
assertValid("alternatives database fixture", validateAlternativesDatabase({ alternatives: [validAlternative] }));

const duplicateVendor = clone(validVendorProfile);
duplicateVendor.name = "Duplicate GA4";
assertInvalid(
  "duplicate vendor IDs",
  validateVendorDatabase({ vendors: [validVendorProfile, duplicateVendor] }),
  "vendors\\[1\\].id",
  "duplicate id"
);

const invalidFingerprint = clone(validFingerprint);
invalidFingerprint.result.vendor_id = null;
delete invalidFingerprint.result.candidate_category;
assertInvalid(
  "fingerprint-only candidate without category",
  validateFingerprintDatabase({ fingerprints: [invalidFingerprint] }),
  "fingerprints\\[0\\].result.candidate_category",
  "required when vendor_id is null"
);

const invalidAlternativeDatabase = {
  alternatives: [validAlternative],
  sponsored_rankings: true
};
assertInvalid(
  "extra alternatives database field",
  validateAlternativesDatabase(invalidAlternativeDatabase),
  "<root>",
  "expected only field"
);

console.log("Rules database schema fixtures passed.");
