import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderJsonReport, renderMarkdownReport, toReport } from "@scaneur/reports";
import { validateScanResult } from "@scaneur/types";
import { validVendorProfile } from "../../types/test/fixtures.mjs";
import {
  discoverFiles,
  matchEvidenceCandidatesWithUnknowns,
  parseDiscoveredFile
} from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const examplesRoot = path.join(repoRoot, "examples");

const forbiddenFixtureValues = [
  "sk_test_fixture_do_not_print",
  "sk_live_local_fixture_do_not_print",
  "sk_live_realistic_but_fake_do_not_print",
  "sk-test-openai-fixture-do-not-print",
  "fixture_token_do_not_print",
  "SG.fixture_do_not_print",
  "acme_fixture_do_not_print",
  "auth_fixture_do_not_print",
  "customer@example.invalid",
  "Fixture Person",
  "not-a-real-private-key-fixture"
];

function clone(value) {
  return structuredClone(value);
}

function vendor(id, name, category, identifiers, options = {}) {
  const profile = clone(validVendorProfile);
  profile.id = id;
  profile.name = name;
  profile.category = category;
  profile.secondary_categories = options.secondary_categories ?? [];
  profile.aliases = options.aliases ?? [];
  profile.website = options.website ?? `https://${id}.example.invalid`;
  profile.identifiers = {
    domains: [],
    packages: { npm: [], pypi: [], other: [] },
    env_patterns: [],
    docker_images: [],
    github_actions: [],
    config_files: [],
    terraform_providers: [],
    ...identifiers,
    packages: {
      npm: identifiers.packages?.npm ?? [],
      pypi: identifiers.packages?.pypi ?? [],
      other: identifiers.packages?.other ?? []
    }
  };
  profile.common_use_cases = options.common_use_cases ?? [category];
  profile.scoring_defaults = {
    jurisdiction_signal: options.jurisdiction_signal ?? "high",
    data_sensitivity_signal: options.data_sensitivity_signal ?? "high",
    operational_criticality: options.operational_criticality ?? "medium",
    migration_effort: options.migration_effort ?? "medium",
    alternative_maturity: options.alternative_maturity ?? "medium",
    evidence_confidence: options.evidence_confidence ?? "medium"
  };
  profile.operational_criticality_default = profile.scoring_defaults.operational_criticality;
  profile.migration_effort_default = profile.scoring_defaults.migration_effort;
  profile.recommendation_defaults = {
    categories: options.recommendations ?? ["review_contractually", "monitor"],
    notes: "Fixture profile for deterministic scanner tests."
  };
  profile.limitations = ["Fixture profile; production usage still requires manual review."];
  profile.notes = "Fixture profile only.";
  return profile;
}

const vendorDatabase = {
  vendors: [
    vendor("stripe", "Stripe", "payments", {
      domains: ["api.stripe.com"],
      packages: { npm: ["@stripe/stripe-js"], pypi: ["stripe"], other: [] },
      env_patterns: ["^STRIPE_"],
      docker_images: ["stripe/stripe-cli"],
      github_actions: [],
      config_files: []
    }, {
      operational_criticality: "high",
      migration_effort: "high",
      recommendations: ["review_contractually"]
    }),
    vendor("sentry", "Sentry", "observability", {
      domains: ["sentry.io", "ingest.sentry.io", "example.ingest.sentry.io"],
      packages: { npm: ["@sentry/nextjs", "@sentry/node"], pypi: ["sentry-sdk"], other: [] },
      env_patterns: ["^SENTRY_"],
      docker_images: ["ghcr.io/getsentry/*"],
      github_actions: [],
      config_files: ["sentry.properties"]
    }),
    vendor("vercel", "Vercel", "hosting", {
      domains: ["vercel.com"],
      packages: { npm: ["@vercel/analytics"], pypi: [], other: [] },
      env_patterns: ["^VERCEL_"],
      docker_images: [],
      github_actions: [],
      config_files: ["vercel.json"]
    }, {
      operational_criticality: "high",
      migration_effort: "high"
    }),
    vendor("openai", "OpenAI", "ai_api", {
      domains: ["api.openai.com"],
      packages: { npm: ["openai"], pypi: ["openai"], other: [] },
      env_patterns: ["^OPENAI_"],
      docker_images: [],
      github_actions: [],
      config_files: []
    }),
    vendor("sendgrid", "SendGrid", "email_sms", {
      domains: ["api.sendgrid.com"],
      packages: { npm: ["@sendgrid/mail"], pypi: ["sendgrid"], other: [] },
      env_patterns: ["^SENDGRID_"],
      docker_images: [],
      github_actions: [],
      config_files: []
    }),
    vendor("supabase", "Supabase", "database", {
      domains: ["supabase.com"],
      packages: { npm: ["@supabase/supabase-js"], pypi: [], other: [] },
      env_patterns: ["^SUPABASE_"],
      docker_images: ["supabase/postgres", "ghcr.io/supabase/gotrue"],
      github_actions: [],
      config_files: []
    }, {
      operational_criticality: "high",
      migration_effort: "high"
    }),
    vendor("cloudflare", "Cloudflare", "deployment_platform", {
      domains: ["api.cloudflare.com"],
      packages: { npm: ["wrangler"], pypi: [], other: [] },
      env_patterns: ["^CLOUDFLARE_"],
      docker_images: [],
      github_actions: ["cloudflare/pages-action"],
      config_files: ["wrangler.toml"]
    }, {
      secondary_categories: ["cloud_infrastructure"],
      operational_criticality: "high",
      migration_effort: "medium"
    }),
    vendor("ga4", "Google Analytics 4", "analytics", {
      domains: ["analytics.google.com", "www.googletagmanager.com"],
      packages: { npm: ["react-ga4"], pypi: [], other: [] },
      env_patterns: ["^GA_MEASUREMENT_ID$"],
      docker_images: [],
      github_actions: [],
      config_files: []
    }, {
      operational_criticality: "medium",
      migration_effort: "medium",
      recommendations: ["configure_better", "review_contractually", "monitor"]
    })
  ]
};

const fingerprintDatabase = { fingerprints: [] };

async function scanExample(exampleName, options = {}) {
  let targetPath = path.join(examplesRoot, exampleName);
  let temporaryRoot = null;

  if (options.files) {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `scaneur-${exampleName}-`));
    targetPath = path.join(temporaryRoot, exampleName);
    await cp(path.join(examplesRoot, exampleName), targetPath, { recursive: true });
    await Promise.all(
      Object.entries(options.files).map(([relativePath, content]) =>
        writeFile(path.join(targetPath, relativePath), content, "utf8")
      )
    );
  }

  const discovery = await discoverFiles(targetPath);
  const evidenceCandidates = [];
  const parserWarnings = [];

  for (const file of discovery.files_scanned) {
    const parsed = await parseDiscoveredFile(targetPath, file);
    evidenceCandidates.push(...parsed.evidence_candidates);
    parserWarnings.push(...parsed.parser_warnings);
  }

  const matched = matchEvidenceCandidatesWithUnknowns(evidenceCandidates, {
    vendorDatabase,
    fingerprintDatabase
  });

  const scanResult = {
    schema_version: "0.1",
    scan_metadata: {
      scanner_version: "0.1.0",
      database_version: "fixture",
      methodology_version: "0.1.0",
      scan_started_at: "2026-04-30T10:00:00Z",
      scan_completed_at: "2026-04-30T10:00:01Z",
      scan_mode: "local_offline",
      target_path: `examples/${exampleName}`,
      files_scanned_count: discovery.files_scanned.length,
      files_skipped_count: discovery.files_skipped.length
    },
    summary: {
      detected_vendor_count: matched.findings.length,
      unknown_candidate_count: matched.unknown_candidates.length,
      high_priority_review_count: matched.findings.filter((finding) =>
        finding.recommendations.includes("review_contractually") ||
        finding.recommendations.includes("manual_review_required")
      ).length,
      quick_win_count: matched.findings.filter((finding) =>
        finding.recommendations.includes("replace_now") ||
        finding.recommendations.includes("configure_better")
      ).length,
      strategic_dependency_count: matched.findings.filter((finding) =>
        finding.recommendations.includes("strategic_migration_only")
      ).length
    },
    findings: matched.findings,
    unknown_candidates: matched.unknown_candidates,
    files_scanned: discovery.files_scanned,
    files_skipped: discovery.files_skipped,
    parser_warnings: parserWarnings
  };

  try {
    const validation = validateScanResult(scanResult);
    assert.equal(validation.success, true, validation.success ? "" : JSON.stringify(validation.errors, null, 2));

    return {
      ...scanResult,
      evidenceCandidates
    };
  } finally {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function findingIds(scanResult) {
  return scanResult.findings.map((finding) => finding.vendor_id);
}

function unknownIds(scanResult) {
  return scanResult.unknown_candidates.map((candidate) => candidate.candidate_id);
}

function skippedReasons(scanResult) {
  return new Map(scanResult.files_skipped.map((file) => [file.path, file.reason]));
}

function assertNoForbiddenValues(value, label) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of forbiddenFixtureValues) {
    assert.equal(serialized.includes(secret), false, `${label} leaked fixture value ${secret}`);
  }
}

async function withNetworkBlocked(fn) {
  let calls = 0;
  const fail = () => {
    calls += 1;
    throw new Error("Network access is forbidden in scanner privacy tests.");
  };
  const original = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    netConnect: net.connect,
    tlsConnect: tls.connect
  };

  globalThis.fetch = fail;
  http.request = fail;
  http.get = fail;
  https.request = fail;
  https.get = fail;
  net.connect = fail;
  tls.connect = fail;

  try {
    const result = await fn();
    assert.equal(calls, 0, "default fixture scan must not attempt network access");
    return result;
  } finally {
    globalThis.fetch = original.fetch;
    http.request = original.httpRequest;
    http.get = original.httpGet;
    https.request = original.httpsRequest;
    https.get = original.httpsGet;
    net.connect = original.netConnect;
    tls.connect = original.tlsConnect;
  }
}

const nodeBasic = await scanExample("node-basic");
assert.deepEqual(findingIds(nodeBasic), []);
assert.deepEqual(unknownIds(nodeBasic), []);
assert.deepEqual(nodeBasic.files_scanned.map((file) => file.path), ["Dockerfile", "package.json"]);

const nodeNext = await scanExample("node-next-sentry-stripe", {
  files: {
    ".env.local": "STRIPE_SECRET_KEY=sk_live_local_fixture_do_not_print\nCUSTOMER_EMAIL=customer@example.invalid\n"
  }
});
assert.deepEqual(findingIds(nodeNext), ["openai", "sentry", "stripe", "vercel"]);
assert.equal(skippedReasons(nodeNext).get(".env.local"), "sensitive_file_default_skip");
assert.ok(nodeNext.findings.find((finding) => finding.vendor_id === "stripe").evidence.some((item) => item.redacted));
assertNoForbiddenValues(nodeNext.evidenceCandidates, "node-next evidence candidates");

const pythonApi = await scanExample("python-api-sendgrid");
assert.deepEqual(findingIds(pythonApi), ["sendgrid"]);
assert.equal(pythonApi.findings[0].evidence.length, 4);
assertNoForbiddenValues(pythonApi, "python API scan result");

const compose = await scanExample("docker-compose-supabase");
assert.deepEqual(findingIds(compose), ["supabase"]);
assert.equal(compose.findings[0].evidence.length, 2);

const cloudflare = await scanExample("github-actions-cloudflare");
assert.deepEqual(findingIds(cloudflare), ["cloudflare"]);
assert.ok(cloudflare.findings[0].evidence.some((item) => item.evidence_type === "github_action"));
assert.ok(cloudflare.findings[0].evidence.some((item) => item.evidence_type === "config_file"));

const unknownServices = await scanExample("unknown-services");
assert.deepEqual(findingIds(unknownServices), []);
assert.deepEqual(unknownIds(unknownServices), [
  "unknown:docker_image:ghcr.io/acme-observer",
  "unknown:env_prefix:ACME",
  "unknown:external_domain:collector.acme-observer.test",
  "unknown:github_action:acme-observer"
]);
assertNoForbiddenValues(unknownServices, "unknown services scan result");

const redaction = await withNetworkBlocked(() => scanExample("secrets-redaction"));
assert.deepEqual(findingIds(redaction), ["openai", "stripe"]);
assert.equal(skippedReasons(redaction).get(".env"), "sensitive_file_default_skip");
assert.equal(skippedReasons(redaction).get("private.key"), "sensitive_file_default_skip");

const { evidenceCandidates: _redactionEvidenceCandidates, ...redactionScanResult } = redaction;
const report = toReport(redactionScanResult);
const markdown = renderMarkdownReport(report);
const json = renderJsonReport(report);
assert.match(markdown, /## Important disclaimer/);
assert.match(json, /"report_type": "scaneur_report"/);
assertNoForbiddenValues(markdown, "markdown report");
assertNoForbiddenValues(json, "json report");
assert.equal(markdown.includes(examplesRoot), false, "markdown report should use fixture-relative paths");
assert.equal(json.includes(examplesRoot), false, "JSON report should use fixture-relative paths");

const monorepo = await scanExample("monorepo-large");
assert.deepEqual(findingIds(monorepo), ["ga4", "sendgrid", "sentry", "stripe", "supabase"]);
assert.deepEqual(monorepo.files_scanned.map((file) => file.path), [
  "apps/web/.env.example",
  "apps/web/package.json",
  "docker-compose.yml",
  "package.json",
  "packages/api/requirements.txt"
]);

console.log("MVP fixture, privacy, and report fixtures passed.");
