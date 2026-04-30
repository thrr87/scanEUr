import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverFiles, isSensitiveFile } from "../src/index.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "file-discovery-repo"
);

function paths(items) {
  return items.map((item) => item.path);
}

function skipReasons(result) {
  return new Map(result.files_skipped.map((item) => [item.path, item.reason]));
}

const result = await discoverFiles(fixtureRoot);

assert.deepEqual(paths(result.files_scanned), [
  ".env.example",
  ".env.sample",
  ".env.template",
  ".github/workflows/ci.yml",
  "Dockerfile",
  "docker-compose.yml",
  "main.tf",
  "netlify.toml",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "vercel.json"
]);

assert.deepEqual(
  result.files_scanned.map((file) => [file.path, file.file_type, file.parser, file.status]),
  [
    [".env.example", "env_template", "env_template", "scanned"],
    [".env.sample", "env_template", "env_template", "scanned"],
    [".env.template", "env_template", "env_template", "scanned"],
    [".github/workflows/ci.yml", "workflow", "github_actions", "scanned"],
    ["Dockerfile", "dockerfile", "dockerfile", "scanned"],
    ["docker-compose.yml", "dockerfile", "docker_compose", "scanned"],
    ["main.tf", "terraform", "terraform", "scanned"],
    ["netlify.toml", "config_file", "config_file", "scanned"],
    ["package-lock.json", "lockfile", "package_lock", "scanned"],
    ["package.json", "package_manifest", "package_json", "scanned"],
    ["pnpm-lock.yaml", "lockfile", "pnpm_lock", "scanned"],
    ["vercel.json", "config_file", "config_file", "scanned"]
  ]
);

assert.deepEqual(paths(result.files_scanned), [...paths(result.files_scanned)].sort());
assert.deepEqual(paths(result.files_skipped), [...paths(result.files_skipped)].sort());

const reasons = skipReasons(result);
assert.equal(reasons.get(".env"), "sensitive_file_default_skip");
assert.equal(reasons.get(".env.development"), "sensitive_file_default_skip");
assert.equal(reasons.get(".env.local"), "sensitive_file_default_skip");
assert.equal(reasons.get(".env.production"), "sensitive_file_default_skip");
assert.equal(reasons.get(".env.staging"), "sensitive_file_default_skip");
assert.equal(reasons.get("api_key.tf"), "sensitive_file_default_skip");
assert.equal(reasons.get("github_token.tf"), "sensitive_file_default_skip");
assert.equal(reasons.get("id_rsa"), "sensitive_file_default_skip");
assert.equal(reasons.get("private.key"), "sensitive_file_default_skip");
assert.equal(reasons.get("secrets.pem"), "sensitive_file_default_skip");
assert.equal(reasons.get("service-account.json"), "sensitive_file_default_skip");
assert.equal(reasons.get("dist"), "ignored_directory");
assert.equal(reasons.get("node_modules"), "ignored_directory");
assert.equal(reasons.get("src/index.ts"), "unsupported_file_type");
assert.equal(reasons.get("vendor"), "ignored_directory");

assert.equal(paths(result.files_scanned).includes("node_modules/hidden/package.json"), false);
assert.equal(paths(result.files_scanned).includes("vendor/package.json"), false);
assert.equal(paths(result.files_scanned).includes("dist/package.json"), false);
assert.equal(paths(result.files_scanned).includes("src/index.ts"), false);

const vendorIncludedResult = await discoverFiles(fixtureRoot, { includeDirectories: ["vendor"] });
assert.equal(paths(vendorIncludedResult.files_scanned).includes("vendor/package.json"), true);
assert.equal(skipReasons(vendorIncludedResult).has("vendor"), false);

const smallLimitResult = await discoverFiles(fixtureRoot, { maxFileBytes: 10 });
const smallLimitReasons = skipReasons(smallLimitResult);
assert.equal(smallLimitReasons.get("package.json"), "file_too_large");
assert.equal(smallLimitReasons.get("vercel.json"), "file_too_large");
assert.equal(smallLimitReasons.get(".env"), "sensitive_file_default_skip");

assert.equal(isSensitiveFile(".env.example"), false);
assert.equal(isSensitiveFile(".env.sample"), false);
assert.equal(isSensitiveFile(".env.template"), false);
assert.equal(isSensitiveFile(".env.local.example"), true);
assert.equal(isSensitiveFile("api_key.tf"), true);
assert.equal(isSensitiveFile("github_token.tf"), true);
assert.equal(isSensitiveFile("id_ed25519"), true);
assert.equal(isSensitiveFile("client-token.json"), true);

console.log("File discovery fixtures passed.");
