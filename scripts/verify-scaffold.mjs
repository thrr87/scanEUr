import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseVersion = "0.1.0";

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
  "README.md",
  "RELEASE_NOTES.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "FUNDING.md",
  "LICENSE",
  "LICENSE_NOTES.md",
  "METHODOLOGY.md",
  "NO_AFFILIATE_POLICY.md",
  "SECURITY.md",
  "VENDOR_INCLUSION_POLICY.md",
  "tsconfig.base.json",
  ".gitignore",
  "apps/docs/package.json",
  "apps/docs/README.md",
  "apps/docs/scripts/astro.mjs",
  "packages/cli/package.json",
  "packages/cli/README.md",
  "packages/cli/database/vendors/analytics/ga4.yml",
  "packages/cli/database/vendors/payments/stripe.yml",
  "packages/cli/database/fingerprints/npm.yml",
  "packages/cli/database/alternatives/analytics.yml",
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

const allowedExternalDependencies = new Map([
  ["apps/docs/package.json", new Set(["astro"])]
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
if (rootPackage.version !== releaseVersion) {
  fail(`Root package version must be ${releaseVersion}`);
}
if (rootPackage.private !== true) {
  fail("Root package must remain private.");
}

const docsPackage = readJson("apps/docs/package.json");
for (const scriptName of ["dev", "build", "preview"]) {
  if (docsPackage.scripts?.[scriptName] !== `node scripts/astro.mjs ${scriptName}`) {
    fail(`apps/docs ${scriptName} script must use scripts/astro.mjs`);
  }
}
const docsAstroWrapper = readFileSync(path.join(root, "apps/docs/scripts/astro.mjs"), "utf8");
if (!docsAstroWrapper.includes("ASTRO_TELEMETRY_DISABLED")) {
  fail("apps/docs/scripts/astro.mjs must disable Astro telemetry");
}

for (const [relativePath, expectedName] of packageNames.entries()) {
  const packageJson = readJson(relativePath);
  if (packageJson.name !== expectedName) {
    fail(`${relativePath} must be named ${expectedName}`);
  }
  if (packageJson.version !== releaseVersion) {
    fail(`${relativePath} must be version ${releaseVersion}`);
  }
  if (relativePath.startsWith("packages/") && packageJson.private === true) {
    fail(`${relativePath} must not be private for release packaging`);
  }
  if (relativePath.startsWith("packages/") && packageJson.publishConfig?.access !== "public") {
    fail(`${relativePath} must declare publishConfig.access public`);
  }

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const dependencies = packageJson[field] ?? {};
    for (const dependencyName of Object.keys(dependencies)) {
      const allowedForPackage = allowedExternalDependencies.get(relativePath) ?? new Set();
      if (!dependencyName.startsWith("@scaneur/") && !allowedForPackage.has(dependencyName)) {
        fail(`${relativePath} contains external ${field} dependency: ${dependencyName}`);
      }
      if (dependencyName.startsWith("@scaneur/") && dependencies[dependencyName] !== releaseVersion) {
        fail(`${relativePath} dependency ${dependencyName} must be version ${releaseVersion}`);
      }
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("Scaffold verification passed.");
