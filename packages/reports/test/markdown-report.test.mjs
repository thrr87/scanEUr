import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateReport } from "@scaneur/types";
import { validScanResult } from "../../types/test/fixtures.mjs";
import { DEFAULT_DISCLAIMER, renderMarkdownReport, toReport } from "../src/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(testDir, "__snapshots__", "markdown-report.md");

function clone(value) {
  return structuredClone(value);
}

function markdownFixture() {
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
      message: "Invalid optional field was ignored."
    }
  ];
  return fixture;
}

const report = toReport(markdownFixture());
const validation = validateReport(report);
assert.equal(validation.success, true, validation.success ? "" : JSON.stringify(validation.errors));
assert.equal(report.disclaimer, DEFAULT_DISCLAIMER);

const markdown = renderMarkdownReport(report);
const snapshot = readFileSync(snapshotPath, "utf8");

assert.equal(markdown, snapshot);
assert.match(markdown, /## Executive summary/);
assert.match(markdown, /## Important disclaimer/);
assert.match(markdown, /## High-priority review items/);
assert.match(markdown, /## Quick wins/);
assert.match(markdown, /## Strategic dependencies/);
assert.match(markdown, /## Detected vendors/);
assert.match(markdown, /## Unknown vendor candidates/);
assert.match(markdown, /## Alternatives overview/);
assert.match(markdown, /## Files scanned/);
assert.match(markdown, /## Files skipped/);
assert.match(markdown, /## Parser warnings/);
assert.match(markdown, /## Methodology and scoring/);
assert.match(markdown, /## Limitations/);
assert.match(markdown, /Evidence confidence/);
assert.match(markdown, /Unknowns:/);
assert.match(markdown, /STRIPE_SECRET_KEY=\[redacted\]/);
assert.doesNotMatch(markdown, /sk_live_real_secret/);
assert.doesNotMatch(markdown, /not-a-real-private-key-body/);
assert.doesNotMatch(markdown, /-----END PRIVATE KEY-----/);
