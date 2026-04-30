import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadVendorDatabase } from "@scaneur/rules";
import { validateFinding } from "@scaneur/types";
import { validVendorProfile } from "../../types/test/fixtures.mjs";
import { matchEvidenceCandidates } from "../src/index.js";

function clone(value) {
  return structuredClone(value);
}

function stripeVendor() {
  const vendor = clone(validVendorProfile);
  vendor.id = "stripe";
  vendor.name = "Stripe";
  vendor.category = "payments";
  vendor.secondary_categories = ["billing"];
  vendor.aliases = ["Stripe Checkout"];
  vendor.website = "https://stripe.com";
  vendor.identifiers = {
    domains: ["api.stripe.com"],
    packages: {
      npm: ["@stripe/stripe-js"],
      pypi: ["stripe"],
      other: ["github.com/stripe/stripe-go"]
    },
    env_patterns: ["^STRIPE_"],
    docker_images: ["stripe/stripe-cli"],
    github_actions: ["stripe/stripe-cli-action"],
    config_files: ["stripe.config.json"],
    terraform_providers: ["stripe/stripe"]
  };
  vendor.common_use_cases = ["payments"];
  vendor.scoring_defaults.evidence_confidence = "medium";
  return vendor;
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

const database = { vendors: [stripeVendor()] };

const findings = matchEvidenceCandidates(
  [
    candidate({
      source_file: "requirements.txt",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "stripe",
      normalized_value: "stripe",
      confidence_hint: "high",
      line_number: 1,
      metadata: { ecosystem: "pypi" }
    }),
    candidate({
      source_file: "requirements.txt",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "stripe",
      normalized_value: "stripe",
      confidence_hint: "high",
      line_number: 1,
      metadata: { ecosystem: "pypi" }
    }),
    candidate({
      source_file: "vercel.json",
      source_type: "config_file",
      evidence_type: "domain",
      raw_value_safe: "api.stripe.com",
      normalized_value: "api.stripe.com",
      confidence_hint: "medium",
      line_number: 3
    }),
    candidate({
      source_file: ".env.example",
      source_type: "env_template",
      evidence_type: "env_var",
      raw_value_safe: "STRIPE_SECRET_KEY",
      normalized_value: "STRIPE_SECRET_KEY",
      confidence_hint: "low",
      line_number: 2,
      redacted: true
    }),
    candidate({
      source_file: "stripe.config.json",
      source_type: "config_file",
      evidence_type: "config_file",
      raw_value_safe: "stripe.config.json",
      normalized_value: "stripe.config.json",
      confidence_hint: "high"
    }),
    candidate({
      source_file: ".github/workflows/deploy.yml",
      source_type: "workflow",
      evidence_type: "github_action",
      raw_value_safe: "stripe/stripe-cli-action@v1",
      normalized_value: "stripe/stripe-cli-action@v1",
      confidence_hint: "high",
      line_number: 12
    }),
    candidate({
      source_file: "go.mod",
      source_type: "package_manifest",
      evidence_type: "package_name",
      raw_value_safe: "github.com/stripe/stripe-go",
      normalized_value: "github.com/stripe/stripe-go",
      confidence_hint: "high",
      line_number: 4,
      metadata: { ecosystem: "go" }
    })
  ],
  { vendorDatabase: database }
);

assert.equal(findings.length, 1);
assert.equal(findings[0].vendor_id, "stripe");
assert.equal(findings[0].finding_type, "known_vendor");
assert.equal(findings[0].evidence.length, 6, "duplicate package evidence should be deduplicated");
assert.equal(findings[0].scores.evidence_confidence, "high");

const evidenceByType = new Map(findings[0].evidence.map((item) => [item.evidence_type, item]));
assert.equal(evidenceByType.get("package_name").confidence, "high");
assert.ok(findings[0].evidence.some((item) => item.source_file === "go.mod"));
assert.equal(evidenceByType.get("domain").confidence, "medium");
assert.equal(evidenceByType.get("env_var").confidence, "low");
assert.equal(evidenceByType.get("env_var").redacted, true);
assert.equal(evidenceByType.get("env_var").source_file, ".env.example");
assert.equal(evidenceByType.get("github_action").line_number, 12);
assert.ok(evidenceByType.get("config_file").matched_rule_id.includes(":config:"));

const validation = validateFinding(findings[0]);
assert.equal(validation.success, true, validation.success ? "" : JSON.stringify(validation.errors));

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "scaneur-matcher-"));
await mkdir(path.join(tempRoot, "vendors", "payments"), { recursive: true });
await writeFile(
  path.join(tempRoot, "vendors", "payments", "stripe.json"),
  JSON.stringify(stripeVendor(), null, 2)
);

const loaded = await loadVendorDatabase(tempRoot);
assert.equal(loaded.vendors.length, 1);
assert.equal(loaded.vendors[0].id, "stripe");

const invalidRoot = await mkdtemp(path.join(os.tmpdir(), "scaneur-matcher-invalid-"));
await mkdir(path.join(invalidRoot, "vendors"), { recursive: true });
await writeFile(path.join(invalidRoot, "vendors", "invalid.json"), JSON.stringify({ vendors: [{ id: "broken" }] }));
await assert.rejects(() => loadVendorDatabase(invalidRoot), /Vendor database validation failed/);

console.log("Vendor matcher fixtures passed.");
