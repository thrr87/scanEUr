import assert from "node:assert/strict";

import { createVendorMatcher } from "../src/index.js";
import { validFingerprint, validVendorProfile } from "../../types/test/fixtures.mjs";

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
    source_type: "unknown",
    evidence_type: "domain",
    normalized_value: "unknown",
    metadata: {},
    ...overrides
  };
}

const matcher = createVendorMatcher({
  vendorDatabase: { vendors: [stripeVendor()] },
  fingerprintDatabase: {
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
          evidence_label: "Example analytics SDK package"
        }
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
          evidence_label: "Stripe-adjacent package"
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
          evidence_label: "Ambiguous ACME analytics-like env var"
        }
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
          evidence_label: "Ambiguous ACME CRM-like env var"
        }
      })
    ]
  }
});

const fingerprintOnlyMatches = matcher.matchCandidate(
  candidate({
    evidence_type: "package_name",
    normalized_value: "example-analytics-sdk",
    metadata: { ecosystem: "npm" }
  })
);
assert.equal(fingerprintOnlyMatches.length, 1);
assert.equal(fingerprintOnlyMatches[0].kind, "fingerprint");
assert.equal(fingerprintOnlyMatches[0].vendor, null);
assert.equal(fingerprintOnlyMatches[0].fingerprint.result.confidence, "medium");

const mappedMatches = matcher.matchCandidate(
  candidate({
    evidence_type: "package_name",
    normalized_value: "stripe-lite",
    metadata: { ecosystem: "npm" }
  })
);
assert.equal(mappedMatches.length, 1);
assert.equal(mappedMatches[0].kind, "fingerprint");
assert.equal(mappedMatches[0].vendor.id, "stripe");

const ambiguousMatches = matcher.matchCandidate(
  candidate({
    evidence_type: "env_var",
    normalized_value: "ACME_EVENTS_API_KEY"
  })
);
assert.deepEqual(
  ambiguousMatches.map((match) => match.ruleId).sort(),
  ["fingerprint_ambiguous_analytics_env", "fingerprint_ambiguous_crm_env"]
);
assert.ok(ambiguousMatches.every((match) => match.kind === "fingerprint" && match.vendor === null));

console.log("Fingerprint rule matcher fixtures passed.");
