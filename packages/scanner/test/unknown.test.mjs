import assert from "node:assert/strict";

import { validateScanResult } from "@scaneur/types";
import { validVendorProfile, validScanResult } from "../../types/test/fixtures.mjs";
import { detectUnknownCandidates, matchEvidenceCandidatesWithUnknowns } from "../src/index.js";

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
    docker_images: ["stripe/stripe-cli"],
    github_actions: ["stripe/stripe-cli-action"],
    config_files: [],
    terraform_providers: []
  };
  return vendor;
}

function evidence(overrides) {
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

const vendorDatabase = { vendors: [stripeVendor()] };

const unknowns = detectUnknownCandidates(
  [
    evidence({
      source_file: "vercel.json",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "api.acme-observer.test",
      normalized_value: "api.acme-observer.test",
      line_number: 4
    }),
    evidence({
      source_file: ".env.example",
      source_type: "env_template",
      evidence_type: "env_var",
      raw_value_safe: "ACME_API_KEY",
      normalized_value: "ACME_API_KEY",
      line_number: 1,
      redacted: true
    }),
    evidence({
      source_file: ".env.sample",
      source_type: "env_template",
      evidence_type: "env_var",
      raw_value_safe: "ACME_PROJECT_ID",
      normalized_value: "ACME_PROJECT_ID",
      line_number: 2,
      redacted: true
    }),
    evidence({
      source_file: "Dockerfile",
      source_type: "dockerfile",
      evidence_type: "docker_image",
      raw_value_safe: "ghcr.io/acme-observer/collector:1",
      normalized_value: "ghcr.io/acme-observer/collector",
      line_number: 1
    }),
    evidence({
      source_file: ".github/workflows/deploy.yml",
      source_type: "workflow",
      evidence_type: "github_action",
      raw_value_safe: "acme-observer/deploy-action@v1",
      normalized_value: "acme-observer/deploy-action@v1",
      confidence_hint: "high",
      line_number: 8
    }),
    evidence({
      source_file: "config.json",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "api.stripe.com",
      normalized_value: "api.stripe.com",
      line_number: 3
    })
  ],
  { vendorDatabase }
);

assert.deepEqual(
  unknowns.map((candidate) => candidate.candidate_id),
  [
    "unknown:docker_image:ghcr.io/acme-observer",
    "unknown:env_prefix:ACME",
    "unknown:external_domain:api.acme-observer.test",
    "unknown:github_action:acme-observer"
  ]
);

const byType = new Map(unknowns.map((candidate) => [candidate.candidate_type, candidate]));
assert.equal(byType.get("external_domain").normalized_value, "api.acme-observer.test");
assert.equal(byType.get("env_prefix").normalized_value, "ACME");
assert.deepEqual(byType.get("env_prefix").source_files, [".env.example", ".env.sample"]);
assert.equal(byType.get("docker_image").normalized_value, "ghcr.io/acme-observer");
assert.equal(byType.get("github_action").evidence_confidence, "medium");

for (const candidate of unknowns) {
  assert.equal(candidate.manual_review_recommended, true);
  assert.deepEqual(candidate.unsupported_claims, [
    "vendor identity",
    "jurisdiction",
    "ownership/control",
    "data processing role"
  ]);
  assert.ok(candidate.suggested_review_steps.length >= 3);
  assert.equal(candidate.reason_flagged.toLowerCase().includes("vendor identity"), false);
  assert.equal(candidate.reason_flagged.toLowerCase().includes("jurisdiction"), false);
}

const falsePositives = detectUnknownCandidates(
  [
    evidence({
      source_file: "package-lock.json",
      source_type: "lockfile",
      evidence_type: "domain",
      raw_value_safe: "registry.npmjs.org",
      normalized_value: "registry.npmjs.org"
    }),
    evidence({
      source_file: "Dockerfile",
      source_type: "dockerfile",
      evidence_type: "docker_image",
      raw_value_safe: "node:20",
      normalized_value: "node",
      confidence_hint: "low"
    }),
    evidence({
      source_file: ".github/workflows/test.yml",
      source_type: "workflow",
      evidence_type: "github_action",
      raw_value_safe: "actions/checkout@v4",
      normalized_value: "actions/checkout@v4",
      confidence_hint: "high"
    }),
    evidence({
      source_file: ".env.example",
      source_type: "env_template",
      evidence_type: "env_var",
      raw_value_safe: "NEXT_PUBLIC_API_URL",
      normalized_value: "NEXT_PUBLIC_API_URL",
      redacted: true
    }),
    evidence({
      source_file: ".env.example",
      source_type: "env_template",
      evidence_type: "env_var",
      raw_value_safe: "ACME_API_KEY",
      normalized_value: "ACME_API_KEY",
      redacted: true
    })
  ],
  { vendorDatabase }
);

assert.deepEqual(falsePositives, []);

const combined = matchEvidenceCandidatesWithUnknowns(
  [
    evidence({
      source_file: "package.json",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "@stripe/stripe-js",
      normalized_value: "@stripe/stripe-js",
      confidence_hint: "high",
      metadata: { ecosystem: "npm" }
    }),
    evidence({
      source_file: "netlify.toml",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "collector.acme-observer.test",
      normalized_value: "collector.acme-observer.test"
    })
  ],
  { vendorDatabase }
);

assert.equal(combined.findings.length, 1);
assert.equal(combined.findings[0].vendor_id, "stripe");
assert.deepEqual(combined.unknown_candidates.map((candidate) => candidate.candidate_id), [
  "unknown:external_domain:collector.acme-observer.test"
]);

const scanValidation = validateScanResult({
  ...clone(validScanResult),
  summary: {
    ...validScanResult.summary,
    unknown_candidate_count: unknowns.length
  },
  findings: [],
  unknown_candidates: unknowns
});
assert.equal(scanValidation.success, true, scanValidation.success ? "" : JSON.stringify(scanValidation.errors));

console.log("Unknown candidate fixtures passed.");
