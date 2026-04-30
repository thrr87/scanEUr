import assert from "node:assert/strict";

import { validateFinding } from "@scaneur/types";
import { validFingerprint, validVendorProfile } from "../../types/test/fixtures.mjs";
import { matchEvidenceCandidates } from "../src/index.js";

function clone(value) {
  return structuredClone(value);
}

function stripeVendor() {
  const vendor = clone(validVendorProfile);
  vendor.id = "stripe";
  vendor.name = "Stripe";
  vendor.category = "payments";
  vendor.identifiers = {
    domains: ["api.stripe.com"],
    packages: {
      npm: ["@stripe/stripe-js"],
      pypi: ["stripe"],
      other: []
    },
    env_patterns: ["^STRIPE_"],
    docker_images: [],
    github_actions: [],
    config_files: [],
    terraform_providers: []
  };
  vendor.scoring_defaults.evidence_confidence = "medium";
  return vendor;
}

function fingerprint(overrides) {
  return {
    ...clone(validFingerprint),
    ...overrides,
    match: overrides.match ?? clone(validFingerprint.match),
    result: {
      ...clone(validFingerprint.result),
      ...overrides.result
    }
  };
}

function candidate(overrides) {
  return {
    source_file: "unknown",
    source_type: "unknown",
    evidence_type: "domain",
    raw_value_safe: "unknown",
    normalized_value: "unknown",
    parser: "test",
    confidence_hint: "medium",
    line_number: null,
    redacted: false,
    ...overrides
  };
}

function assertValidFinding(finding) {
  const validation = validateFinding(finding);
  assert.equal(validation.success, true, validation.success ? "" : JSON.stringify(validation.errors));
}

const vendorDatabase = { vendors: [stripeVendor()] };
const fingerprintDatabase = {
  fingerprints: [
    fingerprint({
      id: "fingerprint_unknown_analytics_package",
      rule_type: "package",
      match: {
        ecosystem: "npm",
        package_name: "example-analytics-sdk"
      },
      result: {
        vendor_id: null,
        candidate_category: "analytics",
        confidence: "medium",
        evidence_label: "Example analytics SDK package",
        observed_fact: "An example analytics SDK package was found.",
        inference: "The project may integrate with an analytics service.",
        manual_review_recommended: true
      },
      limitations: ["No verified vendor profile exists for this package."]
    }),
    fingerprint({
      id: "fingerprint_stripe_lite_package",
      rule_type: "package",
      match: {
        ecosystem: "npm",
        package_name: "stripe-lite"
      },
      result: {
        vendor_id: "stripe",
        candidate_category: "payments",
        confidence: "low",
        evidence_label: "Stripe-adjacent package",
        manual_review_recommended: true
      },
      limitations: ["Package name is not an official Stripe identifier."]
    }),
    fingerprint({
      id: "fingerprint_ambiguous_analytics_env",
      rule_type: "env_var",
      match: {
        pattern: "^ACME_.*_(?:API_KEY|TOKEN)$",
        case_sensitive: false
      },
      result: {
        vendor_id: null,
        candidate_category: "analytics",
        confidence: "low",
        evidence_label: "Ambiguous ACME analytics-like env var",
        manual_review_recommended: true
      },
      limitations: ["The ACME prefix is ambiguous in this fixture."]
    }),
    fingerprint({
      id: "fingerprint_ambiguous_crm_env",
      rule_type: "env_var",
      match: {
        pattern: "^ACME_.*_(?:API_KEY|TOKEN)$",
        case_sensitive: false
      },
      result: {
        vendor_id: null,
        candidate_category: "crm",
        confidence: "low",
        evidence_label: "Ambiguous ACME CRM-like env var",
        manual_review_recommended: true
      },
      limitations: ["The ACME prefix is ambiguous in this fixture."]
    })
  ]
};

const fingerprintOnlyFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "package.json",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "example-analytics-sdk",
      normalized_value: "example-analytics-sdk",
      confidence_hint: "high",
      line_number: 5,
      metadata: { ecosystem: "npm" }
    })
  ],
  { vendorDatabase, fingerprintDatabase }
);

assert.equal(fingerprintOnlyFindings.length, 1);
assert.equal(fingerprintOnlyFindings[0].finding_id, "fingerprint:fingerprint_unknown_analytics_package");
assert.equal(fingerprintOnlyFindings[0].finding_type, "fingerprint_only");
assert.equal(fingerprintOnlyFindings[0].vendor_id, null);
assert.equal(fingerprintOnlyFindings[0].category, "analytics");
assert.equal(fingerprintOnlyFindings[0].verification_status, "fingerprint_only");
assert.equal(fingerprintOnlyFindings[0].scores.evidence_confidence, "medium");
assert.equal(fingerprintOnlyFindings[0].evidence[0].confidence, "medium");
assert.equal(fingerprintOnlyFindings[0].evidence[0].matched_rule_id, "fingerprint_unknown_analytics_package");
assertValidFinding(fingerprintOnlyFindings[0]);

const mappedFingerprintOnlyFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "package.json",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "stripe-lite",
      normalized_value: "stripe-lite",
      confidence_hint: "high",
      line_number: 8,
      metadata: { ecosystem: "npm" }
    })
  ],
  { vendorDatabase, fingerprintDatabase }
);

assert.equal(mappedFingerprintOnlyFindings.length, 1);
assert.equal(mappedFingerprintOnlyFindings[0].finding_id, "vendor:stripe");
assert.equal(mappedFingerprintOnlyFindings[0].finding_type, "fingerprint_only");
assert.equal(mappedFingerprintOnlyFindings[0].vendor_id, "stripe");
assert.equal(mappedFingerprintOnlyFindings[0].vendor_name, "Stripe");
assert.equal(mappedFingerprintOnlyFindings[0].verification_status, "fingerprint_only");
assert.equal(mappedFingerprintOnlyFindings[0].scores.evidence_confidence, "low");
assert.equal(mappedFingerprintOnlyFindings[0].evidence[0].confidence, "low");
assertValidFinding(mappedFingerprintOnlyFindings[0]);

const attachedFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "package.json",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "stripe-lite",
      normalized_value: "stripe-lite",
      confidence_hint: "high",
      line_number: 8,
      metadata: { ecosystem: "npm" }
    }),
    candidate({
      source_file: "vercel.json",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "api.stripe.com",
      normalized_value: "api.stripe.com",
      confidence_hint: "medium",
      line_number: 3
    })
  ],
  { vendorDatabase, fingerprintDatabase }
);

assert.equal(attachedFindings.length, 1);
assert.equal(attachedFindings[0].finding_id, "vendor:stripe");
assert.equal(attachedFindings[0].finding_type, "known_vendor");
assert.equal(attachedFindings[0].verification_status, "agent_draft");
assert.equal(attachedFindings[0].scores.evidence_confidence, "medium");
assert.deepEqual(
  attachedFindings[0].evidence.map((item) => [item.matched_rule_id, item.confidence]).sort(),
  [
    ["fingerprint_stripe_lite_package", "low"],
    ["vendor:stripe:domain:api.stripe.com", "medium"]
  ]
);
assertValidFinding(attachedFindings[0]);

const ambiguousFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: ".env.example",
      source_type: "env_template",
      evidence_type: "env_var",
      raw_value_safe: "ACME_EVENTS_API_KEY",
      normalized_value: "ACME_EVENTS_API_KEY",
      confidence_hint: "high",
      line_number: 2,
      redacted: true
    })
  ],
  { vendorDatabase, fingerprintDatabase }
);

assert.equal(ambiguousFindings.length, 2);
assert.deepEqual(
  ambiguousFindings.map((finding) => finding.finding_id),
  ["fingerprint:fingerprint_ambiguous_analytics_env", "fingerprint:fingerprint_ambiguous_crm_env"]
);
assert.ok(ambiguousFindings.every((finding) => finding.finding_type === "fingerprint_only"));
assert.ok(ambiguousFindings.every((finding) => finding.vendor_id === null));
assert.ok(ambiguousFindings.every((finding) => finding.evidence[0].confidence === "low"));
assert.ok(ambiguousFindings.every((finding) => finding.evidence[0].redacted === true));
ambiguousFindings.forEach(assertValidFinding);

console.log("Scanner fingerprint fixtures passed.");
