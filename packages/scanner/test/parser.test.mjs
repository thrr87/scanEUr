import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseEvidenceCandidates } from "../src/index.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "parser-repo"
);

async function parseFixture(relativePath, file_type, parser) {
  const content = await readFile(path.join(fixtureRoot, relativePath), "utf8");
  return parseEvidenceCandidates({
    source_file: relativePath,
    source_type: file_type,
    parser,
    content
  });
}

function values(result, evidenceType) {
  return result.evidence_candidates
    .filter((candidate) => candidate.evidence_type === evidenceType)
    .map((candidate) => candidate.normalized_value)
    .sort();
}

function candidate(result, evidenceType, normalizedValue) {
  return result.evidence_candidates.find(
    (item) => item.evidence_type === evidenceType && item.normalized_value === normalizedValue
  );
}

function assertCandidateFormat(result) {
  for (const item of result.evidence_candidates) {
    assert.equal(typeof item.source_file, "string");
    assert.equal(typeof item.source_type, "string");
    assert.equal(typeof item.evidence_type, "string");
    assert.equal(typeof item.raw_value_safe, "string");
    assert.equal(typeof item.normalized_value, "string");
    assert.equal(typeof item.parser, "string");
    assert.equal(typeof item.confidence_hint, "string");
    assert.equal(typeof item.redacted, "boolean");
    assert.ok(item.line_number === null || Number.isInteger(item.line_number));
    assert.equal(item.raw_value_safe.includes("sk_live_do_not_print"), false);
    assert.equal(item.raw_value_safe.includes("real_secret_value"), false);
  }
}

const packageJson = await parseFixture("package.json", "package_manifest", "package_json");
assert.deepEqual(values(packageJson, "package_name"), ["@sentry/nextjs", "react-ga4"]);
assert.ok(values(packageJson, "domain").includes("registry.npmjs.org"));
assertCandidateFormat(packageJson);

const packageJsonWithBundledArrays = parseEvidenceCandidates({
  source_file: "package.json",
  source_type: "package_manifest",
  parser: "package_json",
  content: JSON.stringify({
    dependencies: { "@sentry/nextjs": "^8.0.0" },
    bundledDependencies: ["left-pad"],
    bundleDependencies: ["@scope/bundled"]
  })
});
assert.deepEqual(values(packageJsonWithBundledArrays, "package_name"), [
  "@scope/bundled",
  "@sentry/nextjs",
  "left-pad"
]);
assert.equal(values(packageJsonWithBundledArrays, "package_name").includes("0"), false);
assertCandidateFormat(packageJsonWithBundledArrays);

const packageLock = await parseFixture("package-lock.json", "lockfile", "package_lock");
assert.ok(values(packageLock, "package_name").includes("@sentry/node"));
assert.ok(values(packageLock, "domain").includes("registry.npmjs.org"));
assertCandidateFormat(packageLock);

const pnpmLock = await parseFixture("pnpm-lock.yaml", "lockfile", "pnpm_lock");
assert.ok(values(pnpmLock, "package_name").includes("@vercel/analytics"));
assertCandidateFormat(pnpmLock);

const requirements = await parseFixture("requirements.txt", "package_manifest", "python_requirements");
assert.deepEqual(values(requirements, "package_name"), ["sentry-sdk", "stripe"]);
assert.ok(values(requirements, "domain").includes("example.invalid"));
assert.equal(JSON.stringify(requirements).includes("password"), false);
assertCandidateFormat(requirements);

const pyproject = await parseFixture("pyproject.toml", "package_manifest", "pyproject_toml");
assert.deepEqual(values(pyproject, "package_name"), ["openai", "requests", "sentry-sdk"]);
assertCandidateFormat(pyproject);

const dockerfile = await parseFixture("Dockerfile", "dockerfile", "dockerfile");
assert.ok(values(dockerfile, "docker_image").includes("node"));
assert.ok(values(dockerfile, "docker_image").includes("ghcr.io/supabase/postgres"));
assert.ok(values(dockerfile, "domain").includes("ghcr.io"));
assertCandidateFormat(dockerfile);

const compose = await parseFixture("docker-compose.yml", "dockerfile", "docker_compose");
assert.ok(values(compose, "docker_image").includes("supabase/postgres"));
assert.ok(values(compose, "docker_image").includes("ghcr.io/getsentry/self-hosted"));
assertCandidateFormat(compose);

const env = await parseFixture(".env.example", "env_template", "env_template");
assert.deepEqual(values(env, "env_var"), ["OPENAI_API_KEY", "SENTRY_DSN", "STRIPE_SECRET_KEY"]);
assert.equal(candidate(env, "env_var", "STRIPE_SECRET_KEY").redacted, true);
assert.equal(JSON.stringify(env).includes("sk_live_do_not_print"), false);
assert.equal(JSON.stringify(env).includes("real_secret_value"), false);
assert.equal(JSON.stringify(env).includes("secret@example.invalid"), false);
assertCandidateFormat(env);

const actions = await parseFixture(".github/workflows/deploy.yml", "workflow", "github_actions");
assert.deepEqual(values(actions, "github_action"), [
  "actions/checkout@v4",
  "cloudflare/pages-action@v1",
  "org/repo/.github/workflows/reusable.yml@main"
]);
assertCandidateFormat(actions);

const config = await parseFixture("vercel.json", "config_file", "config_file");
assert.ok(values(config, "config_file").includes("vercel.json"));
assert.ok(values(config, "domain").includes("api.openai.com"));
assertCandidateFormat(config);

const textContent = await readFile(path.join(fixtureRoot, "analytics.config"), "utf8");
const limitedText = parseEvidenceCandidates({
  source_file: "analytics.config",
  source_type: "config_file",
  parser: "limited_text",
  content: textContent
});
assert.ok(values(limitedText, "domain").includes("region1.google-analytics.com"));
assert.ok(values(limitedText, "text_pattern").includes("G-ABCDEFG1"));
assertCandidateFormat(limitedText);

const terraform = parseEvidenceCandidates({
  source_file: "main.tf",
  source_type: "terraform",
  parser: "terraform",
  content: `
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

provider "google" {
  project = "demo"
}

module "vpc" {
  source = "./modules/vpc"
}

resource "aws_lambda_function" "fn" {
  tags = {
    environment = "test"
  }
}
`
});
assert.deepEqual(values(terraform, "terraform_provider"), ["aws", "google", "hashicorp/aws"]);
assertCandidateFormat(terraform);

const sourceText = parseEvidenceCandidates({
  source_file: "src/index.ts",
  source_type: "package_manifest",
  parser: "limited_text",
  content: 'fetch("https://api.openai.com/v1")'
});
assert.equal(sourceText.evidence_candidates.length, 0);
assert.equal(sourceText.parser_warnings.length, 1);

const invalidPackage = parseEvidenceCandidates({
  source_file: "package.json",
  source_type: "package_manifest",
  parser: "package_json",
  content: "{"
});
assert.equal(invalidPackage.evidence_candidates.length, 0);
assert.equal(invalidPackage.parser_warnings.length, 1);

const invalidConfig = parseEvidenceCandidates({
  source_file: "vercel.json",
  source_type: "config_file",
  parser: "config_file",
  content: "{"
});
assert.ok(values(invalidConfig, "config_file").includes("vercel.json"));
assert.equal(invalidConfig.parser_warnings.length, 1);

console.log("Parser fixtures passed.");
