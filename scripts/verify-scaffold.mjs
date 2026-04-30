import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredDirectories = [
  "apps/docs",
  "packages/cli",
  "packages/scanner",
  "packages/rules",
  "packages/reports",
  "packages/types",
  "vendors",
  "vendors/analytics",
  "vendors/authentication",
  "vendors/cloud_infrastructure",
  "vendors/deployment_platform",
  "vendors/payments",
  "vendors/observability",
  "vendors/ai_api",
  "vendors/email_sms",
  "fingerprints",
  "alternatives",
  "examples",
  "examples/node-saas",
  "examples/python-api",
  "examples/astro-site",
  "examples/reports",
  "examples/reports/markdown",
  "examples/reports/json"
];

const requiredFiles = [
  "package.json",
  "tsconfig.base.json",
  ".gitignore",
  "apps/docs/package.json",
  "apps/docs/README.md",
  "packages/cli/package.json",
  "packages/cli/README.md",
  "packages/scanner/package.json",
  "packages/scanner/README.md",
  "packages/rules/package.json",
  "packages/rules/README.md",
  "packages/reports/package.json",
  "packages/reports/README.md",
  "packages/types/package.json",
  "packages/types/README.md",
  "vendors/README.md",
  "fingerprints/README.md",
  "fingerprints/npm.yml",
  "fingerprints/pypi.yml",
  "fingerprints/env.yml",
  "fingerprints/domains.yml",
  "fingerprints/docker.yml",
  "fingerprints/github_actions.yml",
  "fingerprints/config_files.yml",
  "fingerprints/terraform.yml",
  "alternatives/README.md",
  "alternatives/analytics.yml",
  "alternatives/authentication.yml",
  "alternatives/payments.yml",
  "alternatives/observability.yml",
  "alternatives/hosting.yml",
  "alternatives/email.yml",
  "examples/README.md"
];

const packageNames = new Map([
  ["apps/docs/package.json", "@scaneur/docs"],
  ["packages/cli/package.json", "@scaneur/cli"],
  ["packages/scanner/package.json", "@scaneur/scanner"],
  ["packages/rules/package.json", "@scaneur/rules"],
  ["packages/reports/package.json", "@scaneur/reports"],
  ["packages/types/package.json", "@scaneur/types"]
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

for (const relativePath of requiredDirectories) {
  if (!existsSync(path.join(root, relativePath))) {
    fail(`Missing directory: ${relativePath}`);
  }
}

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(root, relativePath))) {
    fail(`Missing file: ${relativePath}`);
  }
}

const rootPackage = readJson("package.json");
const expectedWorkspaces = ["apps/*", "packages/*"];
if (JSON.stringify(rootPackage.workspaces) !== JSON.stringify(expectedWorkspaces)) {
  fail(`Root workspaces must be ${expectedWorkspaces.join(", ")}`);
}

for (const [relativePath, expectedName] of packageNames.entries()) {
  const packageJson = readJson(relativePath);
  if (packageJson.name !== expectedName) {
    fail(`${relativePath} must be named ${expectedName}`);
  }

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const dependencies = packageJson[field] ?? {};
    for (const dependencyName of Object.keys(dependencies)) {
      if (!dependencyName.startsWith("@scaneur/")) {
        fail(`${relativePath} contains external ${field} dependency: ${dependencyName}`);
      }
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("Scaffold verification passed.");
