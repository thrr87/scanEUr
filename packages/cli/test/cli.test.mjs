import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { validAlternative, validVendorProfile } from "../../types/test/fixtures.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cliPath = path.join(repoRoot, "packages", "cli", "src", "index.js");

function execCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, NO_COLOR: "1" }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "scaneur-cli-"));
  const project = path.join(root, "project");
  const db = path.join(root, "db");

  await mkdir(project, { recursive: true });
  await mkdir(path.join(db, "vendors", "analytics"), { recursive: true });
  await mkdir(path.join(db, "fingerprints"), { recursive: true });
  await mkdir(path.join(db, "alternatives"), { recursive: true });

  await writeFile(
    path.join(project, "package.json"),
    JSON.stringify({ dependencies: { "react-ga4": "^2.1.0" } }, null, 2)
  );
  await writeFile(path.join(project, "Dockerfile"), "FROM node:22-alpine\n");
  await writeFile(path.join(db, "vendors", "analytics", "ga4.json"), JSON.stringify(validVendorProfile, null, 2));
  await writeFile(path.join(db, "fingerprints", "empty.json"), JSON.stringify({ fingerprints: [] }, null, 2));
  await writeFile(path.join(db, "alternatives", "analytics.json"), JSON.stringify(validAlternative, null, 2));

  return { root, project, db };
}

const fixture = await makeFixture();

const jsonScan = await execCli(["scan", fixture.project, "--db", fixture.db, "--format", "json"]);
assert.equal(jsonScan.status, 0, jsonScan.stderr);
const parsedScan = JSON.parse(jsonScan.stdout);
assert.equal(parsedScan.scan_metadata.scan_mode, "local_offline");
assert.equal(parsedScan.scan_metadata.files_scanned_count, 2);
assert.equal(parsedScan.summary.detected_vendor_count, 1);
assert.equal(parsedScan.findings[0].vendor_id, "ga4");
assert.equal(parsedScan.findings[0].alternatives[0].name, "Matomo");

const includeScan = await execCli(["scan", fixture.project, "--db", fixture.db, "--format", "json", "--include", "package.json"]);
assert.equal(includeScan.status, 0, includeScan.stderr);
assert.equal(JSON.parse(includeScan.stdout).scan_metadata.files_scanned_count, 2);

const reportPath = path.join(fixture.root, "report.json");
const outputScan = await execCli(["scan", fixture.project, "--db", fixture.db, "--output", reportPath]);
assert.equal(outputScan.status, 0, outputScan.stderr);
assert.match(outputScan.stdout, /Report written:/);
assert.equal(existsSync(reportPath), true);
const writtenReport = JSON.parse(await readFile(reportPath, "utf8"));
assert.equal(writtenReport.summary.detected_vendor_count, 1);

const explain = await execCli(["explain", "ga4", "--db", fixture.db]);
assert.equal(explain.status, 0, explain.stderr);
assert.match(explain.stdout, /Vendor: Google Analytics 4/);
assert.match(explain.stdout, /Local vendor profile only/);

const alternatives = await execCli(["alternatives", "analytics", "--db", fixture.db, "--self-hosted"]);
assert.equal(alternatives.status, 0, alternatives.stderr);
assert.match(alternatives.stdout, /Matomo/);
assert.match(alternatives.stdout, /Known gaps/);

const policyPath = path.join(fixture.root, "scaneur.policy.yml");
const initPolicy = await execCli(["init-policy", "--output", policyPath]);
assert.equal(initPolicy.status, 0, initPolicy.stderr);
assert.match(initPolicy.stdout, /Created/);
assert.match(await readFile(policyPath, "utf8"), /fail_on: "new-high"/);

const autoPolicyCheck = await execCli(["check", fixture.project, "--db", fixture.db], { cwd: fixture.root });
assert.equal(autoPolicyCheck.status, 1, autoPolicyCheck.stderr);
assert.match(autoPolicyCheck.stdout, /Policy: new-high/);

const passingCheck = await execCli([
  "check",
  fixture.project,
  "--db",
  fixture.db,
  "--baseline",
  reportPath,
  "--fail-on",
  "new-high"
]);
assert.equal(passingCheck.status, 0, passingCheck.stderr);
assert.match(passingCheck.stdout, /Result: passed/);
assert.match(passingCheck.stdout, /New high-priority findings: 0/);

const failingCheck = await execCli(["check", fixture.project, "--db", fixture.db, "--fail-on", "new-high"]);
assert.equal(failingCheck.status, 1, failingCheck.stderr);
assert.match(failingCheck.stdout, /Result: failed/);

const invalidFormat = await execCli(["scan", fixture.project, "--format", "xml"]);
assert.equal(invalidFormat.status, 2);

const missingPath = await execCli(["scan", path.join(fixture.root, "missing")]);
assert.equal(missingPath.status, 3);

console.log("CLI fixtures passed.");
