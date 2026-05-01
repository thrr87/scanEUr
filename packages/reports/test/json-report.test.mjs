import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatValidationErrors, validateReport } from "@scaneur/types";
import { validScanResult } from "../../types/test/fixtures.mjs";
import { DEFAULT_DISCLAIMER, renderJSONReport, renderJsonReport, toReport } from "../src/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(testDir, "__snapshots__", "json-report.json");

function clone(value) {
  return structuredClone(value);
}

function jsonFixture() {
  const fixture = clone(validScanResult);
  fixture.summary = {
    detected_vendor_count: 1,
    unknown_candidate_count: 1,
    high_priority_review_count: 1,
    quick_win_count: 1,
    strategic_dependency_count: 1
  };
  fixture.findings[0].recommendations = [
    "configure_better",
    "review_contractually",
    "strategic_migration_only"
  ];
  fixture.findings[0].observed_facts.push(
    "A parser warning included -----BEGIN PRIVATE KEY-----\nnot-a-real-private-key-body\n-----END PRIVATE KEY-----."
  );
  fixture.findings[0].scores.operational_criticality = "high";
  fixture.findings[0].scores.migration_effort = "high";
  fixture.findings[0].evidence.push({
    evidence_id: "ev_secret",
    source_file: ".env.example",
    source_type: "env_template",
    evidence_type: "env_var",
    matched_value: "STRIPE_SECRET_KEY=sk_live_real_secret",
    matched_rule_id: "env_stripe_secret",
    confidence: "medium",
    observed_fact: "The environment variable key `STRIPE_SECRET_KEY` was found in `.env.example`.",
    inference: "The project may integrate with Stripe payments.",
    line_number: 2,
    redacted: false
  });
  fixture.parser_warnings = [
    {
      path: "package.json",
      parser: "package_json",
      message: "Invalid optional field was ignored while reading sk_live_real_secret."
    }
  ];
  return fixture;
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nestedValue, keys);
    }
  }
  return keys;
}

const report = toReport(jsonFixture());
assert.equal(report.disclaimer, DEFAULT_DISCLAIMER);

const json = renderJsonReport(report);
assert.equal(json, renderJSONReport(report));
assert.equal(json.endsWith("\n"), true);

const parsed = JSON.parse(json);
const validation = validateReport(parsed);
assert.equal(validation.success, true, validation.success ? "" : formatValidationErrors(validation.errors));

assert.equal(parsed.schema_version, "0.1");
assert.equal(parsed.report_type, "scaneur_report");
assert.equal(parsed.scan_metadata.methodology_version, "0.1.0");
assert.equal(parsed.scan_metadata.database_version, "2026.04.0");
assert.equal(parsed.summary.detected_vendor_count, 1);
assert.equal(parsed.summary.high_priority_review_count, 1);
assert.equal(parsed.findings[0].finding_id, "vendor:ga4");
assert.equal(parsed.findings[0].evidence[0].evidence_id, "ev_001");
assert.equal(parsed.unknown_candidates[0].candidate_id, "unknown:domain:api.example-service.test");
assert.equal(parsed.files_scanned[0].path, "package.json");
assert.equal(parsed.files_skipped[0].reason, "sensitive_file_default_skip");
assert.equal(parsed.parser_warnings[0].parser, "package_json");
assert.match(parsed.disclaimer, /does not provide legal advice/);

const keys = collectKeys(parsed);
for (const forbiddenKey of ["content", "file_content", "raw_content", "source_code", "raw_source_code", "snippet"]) {
  assert.equal(keys.has(forbiddenKey), false, `JSON report must not expose raw source field ${forbiddenKey}`);
}

const snapshot = readFileSync(snapshotPath, "utf8");
assert.equal(json, snapshot);
assert.doesNotMatch(json, /sk_live_real_secret/);
assert.doesNotMatch(json, /not-a-real-private-key-body/);
assert.doesNotMatch(json, /-----END PRIVATE KEY-----/);
