import assert from "node:assert/strict";

import {
  formatValidationErrors,
  validateAlternative,
  validateFinding,
  validateFingerprint,
  validateReport,
  validateScanResult,
  validateScores,
  validateVendorProfile
} from "../src/index.js";
import {
  validAlternative,
  validFinding,
  validFingerprint,
  validReport,
  validScanResult,
  validScores,
  validVendorProfile
} from "./fixtures.mjs";

function clone(value) {
  return structuredClone(value);
}

function assertValid(label, result) {
  assert.equal(
    result.success,
    true,
    `${label} should be valid:\n${result.success ? "" : formatValidationErrors(result.errors)}`
  );
}

function assertInvalid(label, result, expectedPath, expectedText) {
  assert.equal(result.success, false, `${label} should be invalid`);
  const formatted = formatValidationErrors(result.errors);
  assert.match(formatted, new RegExp(expectedPath.replaceAll(".", "\\.")), formatted);
  assert.match(formatted, new RegExp(expectedText), formatted);
}

assertValid("scores fixture", validateScores(validScores));
assertValid("vendor profile fixture", validateVendorProfile(validVendorProfile));
assertValid("fingerprint fixture", validateFingerprint(validFingerprint));
assertValid("alternative fixture", validateAlternative(validAlternative));
assertValid("finding fixture", validateFinding(validFinding));
assertValid("scan result fixture", validateScanResult(validScanResult));
assertValid("report fixture", validateReport(validReport));

const invalidVendorStatus = clone(validVendorProfile);
invalidVendorStatus.verification.status = "draft";
assertInvalid(
  "invalid vendor verification status",
  validateVendorProfile(invalidVendorStatus),
  "verification.status",
  "agent_draft"
);

const verifiedDraftWithoutEvidence = clone(validVendorProfile);
verifiedDraftWithoutEvidence.verification.status = "verified";
assertInvalid(
  "verified profile without sources",
  validateVendorProfile(verifiedDraftWithoutEvidence),
  "evidence_sources",
  "verified vendor profiles require"
);

const invalidReviewedDate = clone(validVendorProfile);
invalidReviewedDate.verification.last_reviewed = "2026-02-30";
assertInvalid(
  "invalid profile review date",
  validateVendorProfile(invalidReviewedDate),
  "verification.last_reviewed",
  "valid calendar date"
);

const invalidGlobalScore = clone(validScores);
invalidGlobalScore.eu_score = 72;
assertInvalid("global score", validateScores(invalidGlobalScore), "eu_score", "global EU scores");

const invalidAlternativeRanking = clone(validAlternative);
invalidAlternativeRanking.ranking.commercial_influence = "sponsored";
invalidAlternativeRanking.ranking.sponsored = true;
assertInvalid(
  "sponsored alternative ranking",
  validateAlternative(invalidAlternativeRanking),
  "ranking.commercial_influence",
  "none"
);
assertInvalid(
  "sponsored alternative ranking",
  validateAlternative(invalidAlternativeRanking),
  "ranking.sponsored",
  "not allowed"
);

const invalidFingerprint = clone(validFingerprint);
invalidFingerprint.verification_status = "verified";
assertInvalid(
  "verified fingerprint-only rule",
  validateFingerprint(invalidFingerprint),
  "verification_status",
  "fingerprint_only"
);

const invalidReportScore = clone(validReport);
invalidReportScore.findings[0].scores.evidence_confidence = "critical";
assertInvalid(
  "critical evidence confidence",
  validateReport(invalidReportScore),
  "findings\\[0\\].scores.evidence_confidence",
  "low, medium, high, unknown"
);

const invalidReportDisclaimer = clone(validReport);
invalidReportDisclaimer.disclaimer = "scanEUr does not provide legal advice.";
assertInvalid(
  "incomplete report disclaimer",
  validateReport(invalidReportDisclaimer),
  "disclaimer",
  "manual review"
);

console.log("Schema validation fixtures passed.");
