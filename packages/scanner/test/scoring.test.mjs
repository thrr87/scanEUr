import assert from "node:assert/strict";

import { validateFinding } from "@scaneur/types";
import { validFingerprint, validVendorProfile } from "../../types/test/fixtures.mjs";
import { detectUnknownCandidates, matchEvidenceCandidates, recommendFromScores } from "../src/index.js";

function clone(value) {
  return structuredClone(value);
}

function vendor(overrides) {
  const profile = clone(validVendorProfile);
  Object.assign(profile, overrides);
  profile.identifiers = {
    domains: [],
    packages: { npm: [], pypi: [], other: [] },
    env_patterns: [],
    docker_images: [],
    github_actions: [],
    config_files: [],
    terraform_providers: [],
    ...overrides.identifiers
  };
  profile.scoring_defaults = {
    ...clone(validVendorProfile.scoring_defaults),
    ...overrides.scoring_defaults
  };
  profile.recommendation_defaults = {
    ...clone(validVendorProfile.recommendation_defaults),
    ...overrides.recommendation_defaults
  };
  return profile;
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

const ga4 = vendor({
  id: "ga4",
  name: "Google Analytics 4",
  category: "analytics",
  identifiers: {
    domains: ["www.googletagmanager.com"],
    packages: { npm: [], pypi: [], other: [] },
    env_patterns: ["^GA_MEASUREMENT_ID$"]
  },
  scoring_defaults: {
    jurisdiction_signal: "high",
    data_sensitivity_signal: "high",
    operational_criticality: "medium",
    migration_effort: "medium",
    alternative_maturity: "high",
    evidence_confidence: "medium"
  },
  recommendation_defaults: {
    categories: ["monitor"],
    notes: "Analytics profile fixture."
  }
});

const stripe = vendor({
  id: "stripe",
  name: "Stripe",
  category: "payments",
  identifiers: {
    domains: ["api.stripe.com"],
    packages: { npm: ["@stripe/stripe-js"], pypi: ["stripe"], other: [] },
    env_patterns: ["^STRIPE_"]
  },
  scoring_defaults: {
    jurisdiction_signal: "high",
    data_sensitivity_signal: "high",
    operational_criticality: "high",
    migration_effort: "high",
    alternative_maturity: "medium",
    evidence_confidence: "high"
  },
  recommendation_defaults: {
    categories: ["replace_now"],
    notes: "Intentionally unsafe default to verify scoring guardrails."
  }
});

const lowConfidenceVendor = vendor({
  id: "ambiguous_tool",
  name: "Ambiguous Tool",
  category: "analytics",
  identifiers: {
    domains: ["collector.ambiguous.example"],
    packages: { npm: [], pypi: [], other: [] }
  },
  scoring_defaults: {
    jurisdiction_signal: "high",
    data_sensitivity_signal: "high",
    operational_criticality: "low",
    migration_effort: "low",
    alternative_maturity: "high",
    evidence_confidence: "unknown"
  },
  recommendation_defaults: {
    categories: ["replace_now"],
    notes: "Unknown evidence must force manual review."
  }
});

const highDefaultUnknownEvidenceVendor = vendor({
  id: "profile_confident_tool",
  name: "Profile Confident Tool",
  category: "analytics",
  identifiers: {
    domains: ["collector.profile-confident.example"],
    packages: { npm: [], pypi: [], other: [] }
  },
  scoring_defaults: {
    jurisdiction_signal: "high",
    data_sensitivity_signal: "high",
    operational_criticality: "low",
    migration_effort: "low",
    alternative_maturity: "high",
    evidence_confidence: "high"
  },
  recommendation_defaults: {
    categories: [],
    notes: "High-confidence profile with intentionally unknown local evidence."
  }
});

const vendorDatabase = { vendors: [ga4, stripe, lowConfidenceVendor, highDefaultUnknownEvidenceVendor] };

const analyticsFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "analytics.config",
      source_type: "config_file",
      evidence_type: "env_var",
      raw_value_safe: "GA_MEASUREMENT_ID",
      normalized_value: "GA_MEASUREMENT_ID",
      confidence_hint: "medium"
    })
  ],
  { vendorDatabase }
);

assert.equal(analyticsFindings.length, 1);
assert.equal(Object.keys(analyticsFindings[0].scores).length, 6);
assert.deepEqual(Object.keys(analyticsFindings[0].scores).sort(), [
  "alternative_maturity",
  "data_sensitivity_signal",
  "evidence_confidence",
  "jurisdiction_signal",
  "migration_effort",
  "operational_criticality"
]);
assert.ok(analyticsFindings[0].recommendations.includes("configure_better"));
assert.ok(analyticsFindings[0].recommendations.includes("review_contractually"));
assert.ok(!analyticsFindings[0].recommendations.includes("replace_now"));
assertValidFinding(analyticsFindings[0]);

const paymentFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "requirements.txt",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "stripe",
      normalized_value: "stripe",
      confidence_hint: "high",
      metadata: { ecosystem: "pypi" }
    })
  ],
  { vendorDatabase }
);

assert.equal(paymentFindings.length, 1);
assert.ok(paymentFindings[0].recommendations.includes("review_contractually"));
assert.ok(paymentFindings[0].recommendations.includes("strategic_migration_only"));
assert.ok(!paymentFindings[0].recommendations.includes("replace_now"));
assertValidFinding(paymentFindings[0]);

const unknownEvidenceFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "config.js",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "collector.ambiguous.example",
      normalized_value: "collector.ambiguous.example",
      confidence_hint: "unknown"
    })
  ],
  { vendorDatabase }
);

assert.equal(unknownEvidenceFindings.length, 1);
assert.equal(unknownEvidenceFindings[0].scores.evidence_confidence, "unknown");
assert.ok(unknownEvidenceFindings[0].recommendations.includes("manual_review_required"));
assert.ok(!unknownEvidenceFindings[0].recommendations.includes("replace_now"));
assertValidFinding(unknownEvidenceFindings[0]);

const unknownLocalEvidenceFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "config.js",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "collector.profile-confident.example",
      normalized_value: "collector.profile-confident.example",
      confidence_hint: "unknown"
    })
  ],
  { vendorDatabase }
);

assert.equal(unknownLocalEvidenceFindings.length, 1);
assert.equal(unknownLocalEvidenceFindings[0].scores.evidence_confidence, "high");
assert.equal(unknownLocalEvidenceFindings[0].evidence[0].confidence, "unknown");
assert.ok(unknownLocalEvidenceFindings[0].recommendations.includes("manual_review_required"));
assert.ok(!unknownLocalEvidenceFindings[0].recommendations.includes("replace_now"));
assertValidFinding(unknownLocalEvidenceFindings[0]);

const unknownFingerprintFindings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "settings.json",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "api.unknown-crm.example",
      normalized_value: "api.unknown-crm.example",
      confidence_hint: "medium"
    })
  ],
  {
    vendorDatabase,
    fingerprintDatabase: {
      fingerprints: [
        fingerprint({
          id: "fingerprint_unknown_domain",
          rule_type: "domain",
          match: { domains: ["api.unknown-crm.example"] },
          result: {
            vendor_id: null,
            candidate_category: "unknown",
            confidence: "medium",
            evidence_label: "Unknown CRM-like API domain",
            manual_review_recommended: true
          }
        })
      ]
    }
  }
);

assert.equal(unknownFingerprintFindings.length, 1);
assert.deepEqual(unknownFingerprintFindings[0].recommendations, ["manual_review_required"]);
assertValidFinding(unknownFingerprintFindings[0]);

const unknownCandidates = detectUnknownCandidates(
  [
    candidate({
      source_file: "settings.json",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "api.unprofiled-service.example",
      normalized_value: "api.unprofiled-service.example",
      confidence_hint: "medium"
    })
  ],
  { vendorDatabase }
);

assert.equal(unknownCandidates.length, 1);
assert.equal(unknownCandidates[0].manual_review_recommended, true);

assert.deepEqual(
  recommendFromScores(
    {
      jurisdiction_signal: "high",
      data_sensitivity_signal: "high",
      operational_criticality: "medium",
      migration_effort: "low",
      alternative_maturity: "high",
      evidence_confidence: "high"
    },
    { category: "analytics" }
  ),
  ["configure_better", "review_contractually", "replace_now"]
);

console.log("Scanner scoring fixtures passed.");
