import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  loadAlternativesDatabase,
  loadFingerprintDatabase,
  loadVendorDatabase
} from "../packages/rules/src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_SEED_VENDOR_IDS = [
  "auth0",
  "cloudflare",
  "ga4",
  "openai",
  "sendgrid",
  "sentry",
  "stripe",
  "supabase",
  "vercel"
];

const AFFILIATE_QUERY_KEYS = new Set([
  "aff",
  "affiliate",
  "affiliate_id",
  "campaign",
  "partner",
  "ref",
  "referral",
  "sponsor",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term"
]);

const COMMERCIAL_RANKING_TERMS = /\b(affiliate|commission|paid|placement|sponsor|sponsored|vendor_relationship)\b/i;

function issue(path, message) {
  return { path, message };
}

function formatIssues(issues) {
  return issues.map((item) => `${item.path}: ${item.message}`).join("\n");
}

function isConcreteReview(verification) {
  return verification?.last_reviewed !== "unknown" && verification?.reviewed_by !== "unknown";
}

function isUnknownish(value) {
  return value === "unknown" || value === "unknown_review_required";
}

function hasJurisdictionOrControlClaim(vendor) {
  return (
    !isUnknownish(vendor.jurisdiction.headquarters_country) ||
    vendor.jurisdiction.headquarters_region !== "Unknown" ||
    vendor.jurisdiction.eu_establishment !== "unknown" ||
    vendor.jurisdiction.data_residency_options.length > 0 ||
    vendor.ownership_control.control_region !== "Unknown" ||
    !isUnknownish(vendor.ownership_control.parent_company) ||
    vendor.ownership_control.publicly_traded !== "unknown"
  );
}

function hasAlternativeJurisdictionOrControlClaim(alternative) {
  return alternative.control_notes.eu_or_european_control_signal !== "unknown";
}

function assertCleanUrl(issues, urlPath, rawUrl) {
  if (rawUrl === null || rawUrl === "unknown") return;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    issues.push(issue(urlPath, "expected an absolute URL"));
    return;
  }

  for (const [key, value] of parsed.searchParams.entries()) {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = value.toLowerCase();
    if (AFFILIATE_QUERY_KEYS.has(normalizedKey) || COMMERCIAL_RANKING_TERMS.test(normalizedValue)) {
      issues.push(issue(urlPath, "affiliate, referral, sponsored, or tracking query parameters are not allowed"));
    }
  }
}

function collectVendorUrls(issues, vendor, index) {
  assertCleanUrl(issues, `vendors[${index}].website`, vendor.website);
  vendor.evidence_sources.forEach((source, sourceIndex) => {
    assertCleanUrl(issues, `vendors[${index}].evidence_sources[${sourceIndex}].url`, source.url);
  });
}

function collectAlternativeUrls(issues, alternative, index) {
  assertCleanUrl(issues, `alternatives[${index}].alternative.website`, alternative.alternative.website);
  alternative.evidence_sources.forEach((source, sourceIndex) => {
    assertCleanUrl(issues, `alternatives[${index}].evidence_sources[${sourceIndex}].url`, source.url);
  });
}

function validateVendorGovernance(issues, vendors) {
  vendors.forEach((vendor, index) => {
    const prefix = `vendors[${index}]`;
    collectVendorUrls(issues, vendor, index);

    if (vendor.verification.status === "verified" && vendor.evidence_sources.length === 0) {
      issues.push(issue(`${prefix}.evidence_sources`, "verified profiles require evidence"));
    }

    if ((vendor.verification.status === "verified" || vendor.verification.status === "partially_verified") && !isConcreteReview(vendor.verification)) {
      issues.push(issue(`${prefix}.verification`, "reviewed profiles require reviewed_by and last_reviewed"));
    }

    if (!isConcreteReview(vendor.verification) && !["agent_draft", "unknown"].includes(vendor.verification.status)) {
      issues.push(issue(`${prefix}.verification.status`, "unreviewed vendor profiles must remain agent_draft or unknown"));
    }

    if (hasJurisdictionOrControlClaim(vendor) && !isConcreteReview(vendor.verification)) {
      issues.push(issue(`${prefix}.jurisdiction`, "jurisdiction and ownership/control claims require human review"));
    }
  });
}

function validateFingerprintGovernance(issues, fingerprints, vendorIds) {
  fingerprints.forEach((fingerprint, index) => {
    const vendorId = fingerprint.result.vendor_id;
    if (vendorId && !vendorIds.has(vendorId)) {
      issues.push(issue(`fingerprints[${index}].result.vendor_id`, `unknown vendor_id: ${vendorId}`));
    }

    if (fingerprint.verification_status !== "agent_draft") {
      issues.push(issue(`fingerprints[${index}].verification_status`, "seed fingerprints must remain agent_draft until manual review metadata is supported"));
    }
  });
}

function validateAlternativeGovernance(issues, alternatives, vendorIds) {
  alternatives.forEach((alternative, index) => {
    const prefix = `alternatives[${index}]`;
    collectAlternativeUrls(issues, alternative, index);

    if (alternative.source.vendor_id && !vendorIds.has(alternative.source.vendor_id)) {
      issues.push(issue(`${prefix}.source.vendor_id`, `unknown vendor_id: ${alternative.source.vendor_id}`));
    }

    if (alternative.alternative.vendor_id && !vendorIds.has(alternative.alternative.vendor_id)) {
      issues.push(issue(`${prefix}.alternative.vendor_id`, `unknown vendor_id: ${alternative.alternative.vendor_id}`));
    }

    if ((alternative.verification.status === "verified" || alternative.verification.status === "partially_verified") && !isConcreteReview(alternative.verification)) {
      issues.push(issue(`${prefix}.verification`, "reviewed alternatives require reviewed_by and last_reviewed"));
    }

    if (!isConcreteReview(alternative.verification) && !["agent_draft", "unknown"].includes(alternative.verification.status)) {
      issues.push(issue(`${prefix}.verification.status`, "unreviewed alternatives must remain agent_draft or unknown"));
    }

    if (hasAlternativeJurisdictionOrControlClaim(alternative) && !isConcreteReview(alternative.verification)) {
      issues.push(issue(`${prefix}.control_notes`, "alternative jurisdiction and ownership/control claims require human review"));
    }

    if (alternative.ranking.commercial_influence !== "none") {
      issues.push(issue(`${prefix}.ranking.commercial_influence`, "commercial influence must be none"));
    }

    if (alternative.ranking.affiliate_link) {
      issues.push(issue(`${prefix}.ranking.affiliate_link`, "affiliate links are not allowed"));
    }

    if (alternative.ranking.sponsored) {
      issues.push(issue(`${prefix}.ranking.sponsored`, "sponsored rankings are not allowed"));
    }

    alternative.ranking.methodology_basis.forEach((basis, basisIndex) => {
      if (COMMERCIAL_RANKING_TERMS.test(basis)) {
        issues.push(issue(`${prefix}.ranking.methodology_basis[${basisIndex}]`, "paid ranking methodology is not allowed"));
      }
    });
  });
}

function validateRequiredSeeds(issues, vendors, fingerprints) {
  const coveredIds = new Set(vendors.map((vendor) => vendor.id));
  fingerprints.forEach((fingerprint) => {
    if (fingerprint.result.vendor_id) coveredIds.add(fingerprint.result.vendor_id);
  });

  for (const vendorId of REQUIRED_SEED_VENDOR_IDS) {
    if (!coveredIds.has(vendorId)) {
      issues.push(issue("seed.required_vendor_ids", `missing seed profile or fingerprint for ${vendorId}`));
    }
  }
}

export function validateSeedCollections(vendorDatabase, fingerprintDatabase, alternativesDatabase) {
  const issues = [];
  const vendorIds = new Set(vendorDatabase.vendors.map((vendor) => vendor.id));

  validateVendorGovernance(issues, vendorDatabase.vendors);
  validateFingerprintGovernance(issues, fingerprintDatabase.fingerprints, vendorIds);
  validateAlternativeGovernance(issues, alternativesDatabase.alternatives, vendorIds);
  validateRequiredSeeds(issues, vendorDatabase.vendors, fingerprintDatabase.fingerprints);

  return {
    success: issues.length === 0,
    errors: issues,
    summary: {
      vendors: vendorDatabase.vendors.length,
      fingerprints: fingerprintDatabase.fingerprints.length,
      alternatives: alternativesDatabase.alternatives.length
    }
  };
}

export async function validateSeedDatabase(rootPath = repoRoot) {
  const [vendorDatabase, fingerprintDatabase, alternativesDatabase] = await Promise.all([
    loadVendorDatabase(rootPath),
    loadFingerprintDatabase(rootPath),
    loadAlternativesDatabase(rootPath)
  ]);

  return validateSeedCollections(vendorDatabase, fingerprintDatabase, alternativesDatabase);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const targetPath = process.argv[2] ? path.resolve(process.argv[2]) : repoRoot;
  const result = await validateSeedDatabase(targetPath);

  if (!result.success) {
    console.error(`Database validation failed:\n${formatIssues(result.errors)}`);
    process.exit(1);
  }

  console.log(
    `Database validation passed for ${path.relative(repoRoot, targetPath) || "."}: ${result.summary.vendors} vendors, ${result.summary.fingerprints} fingerprints, ${result.summary.alternatives} alternatives.`
  );
}
