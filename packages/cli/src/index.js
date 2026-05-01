#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderJsonReport, renderMarkdownReport, toReport } from "@scaneur/reports";
import {
  discoverFiles,
  matchEvidenceCandidatesWithUnknowns,
  parseDiscoveredFile
} from "@scaneur/scanner";
import {
  loadAlternativesDatabase,
  loadFingerprintDatabase,
  loadVendorDatabase
} from "@scaneur/rules";

export const EXIT_CODES = Object.freeze({
  OK: 0,
  POLICY_FAILED: 1,
  USAGE: 2,
  PATH: 3,
  DATABASE: 4,
  OUTPUT: 5,
  PARSER: 6,
  INTERNAL: 10
});

const DATABASE_VERSION = "2026.04.0";
const METHODOLOGY_VERSION = "0.1.0";
const SCANNER_VERSION = "0.1.0";
const VALID_REPORT_FORMATS = new Set(["markdown", "json"]);
const VALID_CHECK_FORMATS = new Set(["text", "json"]);
const VALID_FAIL_POLICIES = new Set(["new-high", "any-critical", "unknown-critical", "policy"]);
const VALID_TEMPLATES = new Set(["basic", "strict", "advisory"]);
const VALID_EFFORTS = new Set(["low", "medium", "high"]);

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(cliRoot, "..", "..");

function stdout(io, text) {
  io.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function stderr(io, text) {
  io.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

function codeError(message, exitCode) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

function takeValue(tokens, index, flag) {
  const value = tokens[index + 1];
  if (!value || value.startsWith("--")) {
    throw codeError(`Missing value for ${flag}.`, EXIT_CODES.USAGE);
  }
  return value;
}

function parseArgv(argv) {
  const global = {
    config: null,
    db: null,
    noColor: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false
  };
  const commandTokens = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") global.help = true;
    else if (token === "--version") global.version = true;
    else if (token === "--config") {
      global.config = takeValue(argv, index, token);
      index += 1;
    } else if (token === "--db") {
      global.db = takeValue(argv, index, token);
      index += 1;
    } else if (token === "--no-color") global.noColor = true;
    else if (token === "--quiet") global.quiet = true;
    else if (token === "--verbose") global.verbose = true;
    else commandTokens.push(token);
  }

  const command = commandTokens.shift() ?? null;
  return { global, command, args: commandTokens };
}

function parseCommandArgs(tokens, spec) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.split("=", 2);
    const name = rawName.slice(2);
    const flagSpec = spec[name];
    if (!flagSpec) throw codeError(`Unknown flag: ${rawName}.`, EXIT_CODES.USAGE);

    if (flagSpec.type === "boolean") {
      if (inlineValue !== undefined) throw codeError(`Flag ${rawName} does not take a value.`, EXIT_CODES.USAGE);
      flags[name] = true;
      continue;
    }

    const value = inlineValue ?? takeValue(tokens, index, rawName);
    if (inlineValue === undefined) index += 1;
    if (flagSpec.repeat) {
      flags[name] = [...(flags[name] ?? []), value];
    } else {
      flags[name] = value;
    }
  }

  return { flags, positionals };
}

function helpText() {
  return `scanEUr local dependency review CLI

Usage:
  scaneur scan <path> [--format markdown|json] [--output path]
  scaneur explain <vendor-or-slug> [--format markdown|json]
  scaneur alternatives <vendor-or-category> [--format markdown|json]
  scaneur init-policy [--output path] [--force]
  scaneur check <path> [--fail-on policy] [--format text|json]

Global flags:
  --config <path>  Path to policy/config file.
  --db <path>      Local database directory.
  --quiet          Reduce non-report terminal output.
  --verbose        Show local processing details.
  --version        Show CLI version.
`;
}

async function cliVersion() {
  const packageJson = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));
  return packageJson.version;
}

async function databaseDirectoryExists(rootPath) {
  const [vendors, fingerprints, alternatives] = await Promise.all([
    stat(path.join(rootPath, "vendors")).catch(() => null),
    stat(path.join(rootPath, "fingerprints")).catch(() => null),
    stat(path.join(rootPath, "alternatives")).catch(() => null)
  ]);
  return vendors?.isDirectory() && fingerprints?.isDirectory() && alternatives?.isDirectory();
}

async function databaseRoot(global) {
  if (global.db) return path.resolve(global.db);
  if (await databaseDirectoryExists(repoRoot)) return repoRoot;
  return path.join(cliRoot, "database");
}

async function loadDatabases(global) {
  const root = await databaseRoot(global);
  try {
    const [vendorDatabase, fingerprintDatabase, alternativesDatabase] = await Promise.all([
      loadVendorDatabase(root),
      loadFingerprintDatabase(root),
      loadAlternativesDatabase(root)
    ]);
    return { root, vendorDatabase, fingerprintDatabase, alternativesDatabase };
  } catch (error) {
    throw codeError(`Database validation/load failure: ${error.message}`, EXIT_CODES.DATABASE);
  }
}

async function ensureReadableDirectory(targetPath) {
  let stats;
  try {
    stats = await stat(targetPath);
  } catch {
    throw codeError(`Path not found or cannot be read: ${targetPath}`, EXIT_CODES.PATH);
  }
  if (!stats.isDirectory()) {
    throw codeError(`Path is not a directory: ${targetPath}`, EXIT_CODES.PATH);
  }
}

function reportFormat(flags) {
  if (flags.format) {
    if (!VALID_REPORT_FORMATS.has(flags.format)) {
      throw codeError(`Unsupported output format: ${flags.format}.`, EXIT_CODES.USAGE);
    }
    return flags.format;
  }
  if (flags.output && path.extname(flags.output).toLowerCase() === ".json") return "json";
  return "markdown";
}

function matchGlob(pattern, value) {
  if (pattern === value) return true;
  if (!pattern.includes("*")) return value === pattern || path.posix.basename(value) === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("**", "\u0000").replaceAll("*", "[^/]*").replaceAll("\u0000", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function applyDiscoveryFilters(discovery, flags) {
  const exclude = flags.exclude ?? [];
  if (exclude.length === 0) return discovery;

  const files_scanned = [];
  const files_skipped = [...discovery.files_skipped];
  for (const file of discovery.files_scanned) {
    const excluded = exclude.some((pattern) => matchGlob(pattern, file.path));
    if (!excluded) {
      files_scanned.push(file);
    } else {
      files_skipped.push({ path: file.path, reason: "user_excluded", configured_by_user: true });
    }
  }

  files_skipped.sort((left, right) => left.path.localeCompare(right.path));
  return { ...discovery, files_scanned, files_skipped };
}

function alternativeSummary(alternative) {
  return {
    alternative_id: alternative.id,
    name: alternative.alternative.name,
    replacement_type: alternative.replacement.replacement_type,
    fit_level: alternative.replacement.fit_level,
    maturity: alternative.replacement.maturity,
    migration_effort: alternative.replacement.migration_effort,
    known_gaps: alternative.usage_guidance.known_gaps
  };
}

function attachAlternatives(findings, alternativesDatabase) {
  const alternatives = alternativesDatabase.alternatives;
  return findings.map((finding) => ({
    ...finding,
    alternatives: alternatives
      .filter((alternative) => {
        if (alternative.source.vendor_id && alternative.source.vendor_id === finding.vendor_id) return true;
        return alternative.source.category.toLowerCase() === finding.category.toLowerCase();
      })
      .map(alternativeSummary)
  }));
}

function highPriorityFindings(findings) {
  return findings.filter((finding) => {
    if (finding.recommendations.includes("manual_review_required")) return true;
    if (finding.recommendations.includes("review_contractually")) return true;
    return finding.scores.jurisdiction_signal === "critical" || finding.scores.data_sensitivity_signal === "critical";
  });
}

function quickWinFindings(findings) {
  return findings.filter((finding) => finding.recommendations.includes("replace_now") || finding.recommendations.includes("configure_better"));
}

function strategicDependencyFindings(findings) {
  return findings.filter((finding) => {
    if (finding.recommendations.includes("strategic_migration_only")) return true;
    return finding.scores.operational_criticality === "critical" || finding.scores.migration_effort === "critical";
  });
}

function makeSummary(findings, unknownCandidates) {
  return {
    detected_vendor_count: findings.length,
    unknown_candidate_count: unknownCandidates.length,
    high_priority_review_count: highPriorityFindings(findings).length,
    quick_win_count: quickWinFindings(findings).length,
    strategic_dependency_count: strategicDependencyFindings(findings).length
  };
}

async function runScan(targetPath, flags, global) {
  await ensureReadableDirectory(targetPath);
  const startedAt = new Date().toISOString();
  const databases = await loadDatabases(global);

  let discovery;
  try {
    discovery = await discoverFiles(targetPath, {
      maxFileBytes: flags["max-file-size"] ? Number(flags["max-file-size"]) : undefined
    });
  } catch (error) {
    throw codeError(`Parser failure: ${error.message}`, EXIT_CODES.PARSER);
  }

  discovery = applyDiscoveryFilters(discovery, flags);
  const evidenceCandidates = [];
  const parserWarnings = [];

  for (const file of discovery.files_scanned) {
    try {
      const parsed = await parseDiscoveredFile(targetPath, file);
      evidenceCandidates.push(...parsed.evidence_candidates);
      parserWarnings.push(...parsed.parser_warnings);
    } catch (error) {
      parserWarnings.push({ path: file.path, parser: file.parser, message: error.message });
    }
  }

  const matched = matchEvidenceCandidatesWithUnknowns(evidenceCandidates, {
    vendorDatabase: databases.vendorDatabase,
    fingerprintDatabase: databases.fingerprintDatabase
  });
  const findings = attachAlternatives(matched.findings, databases.alternativesDatabase);
  const completedAt = new Date().toISOString();

  return {
    schema_version: "0.1",
    scan_metadata: {
      scanner_version: SCANNER_VERSION,
      database_version: DATABASE_VERSION,
      methodology_version: METHODOLOGY_VERSION,
      scan_started_at: startedAt,
      scan_completed_at: completedAt,
      scan_mode: "local_offline",
      target_path: targetPath,
      files_scanned_count: discovery.files_scanned.length,
      files_skipped_count: discovery.files_skipped.length
    },
    summary: makeSummary(findings, matched.unknown_candidates),
    findings,
    unknown_candidates: matched.unknown_candidates,
    files_scanned: discovery.files_scanned,
    files_skipped: discovery.files_skipped,
    parser_warnings: parserWarnings
  };
}

function renderReport(report, format) {
  if (format === "json") return renderJsonReport(report);
  return renderMarkdownReport(report);
}

async function writeOutputFile(outputPath, content) {
  try {
    await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, content, "utf8");
  } catch (error) {
    throw codeError(`Report output failure: ${error.message}`, EXIT_CODES.OUTPUT);
  }
}

function renderScanCompletion(report, outputPath) {
  return [
    "scanEUr completed local scan.",
    `Files scanned: ${report.files_scanned.length}`,
    `Files skipped: ${report.files_skipped.length}`,
    `Detected vendors: ${report.summary.detected_vendor_count}`,
    `Unknown candidates: ${report.summary.unknown_candidate_count}`,
    `Report written: ${outputPath}`
  ].join("\n");
}

async function commandScan(args, global, io) {
  const { flags, positionals } = parseCommandArgs(args, {
    format: { type: "value" },
    output: { type: "value" },
    include: { type: "value", repeat: true },
    exclude: { type: "value", repeat: true },
    "max-file-size": { type: "value" },
    "show-skipped": { type: "boolean" },
    "fail-on": { type: "value" },
    "no-unknowns": { type: "boolean" },
    "methodology-version": { type: "boolean" },
    "database-version": { type: "boolean" }
  });

  if (flags["methodology-version"]) {
    stdout(io, METHODOLOGY_VERSION);
    return EXIT_CODES.OK;
  }
  if (flags["database-version"]) {
    stdout(io, DATABASE_VERSION);
    return EXIT_CODES.OK;
  }
  if (!positionals[0]) throw codeError("Missing scan path.", EXIT_CODES.USAGE);
  if (flags["max-file-size"] !== undefined && (!Number.isInteger(Number(flags["max-file-size"])) || Number(flags["max-file-size"]) < 0)) {
    throw codeError("Invalid --max-file-size value.", EXIT_CODES.USAGE);
  }

  const format = reportFormat(flags);
  const report = await runScan(positionals[0], flags, global);
  const printableReport = flags["no-unknowns"] && format === "markdown" ? { ...report, unknown_candidates: [] } : report;
  const rendered = renderReport(printableReport, format);

  if (flags.output) {
    await writeOutputFile(flags.output, rendered);
    if (!global.quiet) stdout(io, renderScanCompletion(report, flags.output));
  } else {
    stdout(io, rendered);
    if (flags["show-skipped"] && report.files_skipped.length > 0) {
      stdout(io, report.files_skipped.map((file) => `Skipped: ${file.path} (${file.reason})`).join("\n"));
    }
  }

  return policyTriggered(report, flags["fail-on"] ?? null, null) ? EXIT_CODES.POLICY_FAILED : EXIT_CODES.OK;
}

function findVendorOrFingerprint(query, vendorDatabase, fingerprintDatabase) {
  const normalized = query.toLowerCase();
  const vendor = vendorDatabase.vendors.find((item) => {
    if (item.id.toLowerCase() === normalized) return true;
    if (item.name.toLowerCase() === normalized) return true;
    return item.aliases.some((alias) => alias.toLowerCase() === normalized);
  });
  if (vendor) return { type: "vendor", vendor };

  const fingerprint = fingerprintDatabase.fingerprints.find((item) => item.id.toLowerCase() === normalized);
  return fingerprint ? { type: "fingerprint", fingerprint } : null;
}

function renderVendorMarkdown(vendor, flags) {
  const lines = [
    `Vendor: ${vendor.name}`,
    `Category: ${vendor.category}`,
    `Verification status: ${vendor.verification.status}`,
    `Jurisdiction signal: ${title(vendor.scoring_defaults.jurisdiction_signal)} (manual review recommended)`,
    `Data sensitivity signal: ${title(vendor.scoring_defaults.data_sensitivity_signal)}`,
    `Operational criticality default: ${title(vendor.operational_criticality_default)}`,
    `Migration effort default: ${title(vendor.migration_effort_default)}`,
    "",
    "What was observed:",
    "- Local vendor profile only. This command does not scan a project.",
    "",
    "Notes:",
    `- ${vendor.notes || vendor.recommendation_defaults.notes || "Manual review recommended."}`
  ];

  if (flags["show-rules"]) {
    lines.push("", "Detection patterns:");
    for (const [ecosystem, packages] of Object.entries(vendor.identifiers.packages)) {
      for (const packageName of packages) lines.push(`- ${ecosystem} package: ${packageName}`);
    }
    for (const domain of vendor.identifiers.domains) lines.push(`- domain: ${domain}`);
    for (const pattern of vendor.identifiers.env_patterns) lines.push(`- env pattern: ${pattern}`);
  }

  if (flags["show-sources"] !== false && vendor.evidence_sources.length > 0) {
    lines.push("", "Sources:");
    for (const source of vendor.evidence_sources) lines.push(`- ${source.title}: ${source.url}`);
  }

  return `${lines.join("\n")}\n`;
}

function renderFingerprintMarkdown(fingerprint, flags) {
  const lines = [
    `Fingerprint: ${fingerprint.id}`,
    `Rule type: ${fingerprint.rule_type}`,
    `Verification status: ${fingerprint.verification_status}`,
    `Evidence label: ${fingerprint.result.evidence_label}`,
    `Vendor id: ${fingerprint.result.vendor_id ?? "unknown"}`,
    "",
    "What was observed:",
    "- Local fingerprint mapping only. This command does not scan a project."
  ];

  if (flags["show-rules"]) {
    lines.push("", "Rule:");
    lines.push(JSON.stringify(fingerprint.match, null, 2));
  }

  return `${lines.join("\n")}\n`;
}

async function commandExplain(args, global, io) {
  const { flags, positionals } = parseCommandArgs(args, {
    format: { type: "value" },
    "show-rules": { type: "boolean" },
    "show-sources": { type: "boolean" }
  });
  flags["show-sources"] ??= true;
  if (!positionals[0]) throw codeError("Missing vendor or slug.", EXIT_CODES.USAGE);
  const format = flags.format ?? "markdown";
  if (!VALID_REPORT_FORMATS.has(format)) throw codeError(`Unsupported output format: ${format}.`, EXIT_CODES.USAGE);

  const databases = await loadDatabases(global);
  const match = findVendorOrFingerprint(positionals[0], databases.vendorDatabase, databases.fingerprintDatabase);
  if (!match) throw codeError(`No local vendor profile or fingerprint found for: ${positionals[0]}`, EXIT_CODES.PATH);

  if (format === "json") {
    stdout(io, JSON.stringify(match, null, 2));
  } else if (match.type === "vendor") {
    stdout(io, renderVendorMarkdown(match.vendor, flags));
  } else {
    stdout(io, renderFingerprintMarkdown(match.fingerprint, flags));
  }

  return EXIT_CODES.OK;
}

function effortRank(value) {
  return { low: 1, medium: 2, high: 3, critical: 4, unknown: 5 }[value] ?? 5;
}

function findAlternatives(query, alternativesDatabase) {
  const normalized = query.toLowerCase();
  return alternativesDatabase.alternatives.filter((alternative) => {
    if (alternative.source.vendor_id?.toLowerCase() === normalized) return true;
    if (alternative.alternative.vendor_id?.toLowerCase() === normalized) return true;
    if (alternative.alternative.name.toLowerCase() === normalized) return true;
    return alternative.source.category.toLowerCase() === normalized;
  });
}

function filterAlternatives(alternatives, flags) {
  let result = alternatives;
  if (flags["self-hosted"]) {
    result = result.filter((alternative) => alternative.hosting.self_hosting_option === true);
  }
  if (flags["max-effort"]) {
    if (!VALID_EFFORTS.has(flags["max-effort"])) {
      throw codeError(`Unsupported migration effort: ${flags["max-effort"]}.`, EXIT_CODES.USAGE);
    }
    result = result.filter((alternative) => effortRank(alternative.replacement.migration_effort) <= effortRank(flags["max-effort"]));
  }
  if (flags["eu-control"]) {
    result = [...result].sort((left, right) => {
      const rank = { high: 1, medium: 2, low: 3, unknown: 4 };
      return rank[left.control_notes.eu_or_european_control_signal] - rank[right.control_notes.eu_or_european_control_signal];
    });
  }
  return result;
}

function renderAlternativesMarkdown(query, alternatives) {
  if (alternatives.length === 0) {
    return `No local alternatives found for ${query}.\nAlternatives are use-case dependent. Absence from the local database is not a recommendation.\n`;
  }

  const lines = [
    `Alternatives for ${query}`,
    "",
    "These entries are local review aids, not universal recommendations.",
    ""
  ];
  for (const item of alternatives) {
    lines.push(
      `## ${item.alternative.name}`,
      "",
      `- Source category: ${item.source.category}`,
      `- Replacement type: ${item.replacement.replacement_type}`,
      `- Fit: ${title(item.replacement.fit_level)}`,
      `- Maturity: ${title(item.replacement.maturity)}`,
      `- Migration effort: ${title(item.replacement.migration_effort)}`,
      `- Self-hosting option: ${String(item.hosting.self_hosting_option)}`,
      `- EU/control signal: ${title(item.control_notes.eu_or_european_control_signal)}`,
      "- Known gaps:",
      ...(item.usage_guidance.known_gaps.length > 0 ? item.usage_guidance.known_gaps.map((gap) => `  - ${gap}`) : ["  - None recorded."]),
      "- Poor-fit cases:",
      ...(item.usage_guidance.poor_fit_cases.length > 0 ? item.usage_guidance.poor_fit_cases.map((gap) => `  - ${gap}`) : ["  - None recorded."]),
      ""
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

async function commandAlternatives(args, global, io) {
  const { flags, positionals } = parseCommandArgs(args, {
    format: { type: "value" },
    "self-hosted": { type: "boolean" },
    "eu-control": { type: "boolean" },
    "max-effort": { type: "value" }
  });
  if (!positionals[0]) throw codeError("Missing vendor or category.", EXIT_CODES.USAGE);
  const format = flags.format ?? "markdown";
  if (!VALID_REPORT_FORMATS.has(format)) throw codeError(`Unsupported output format: ${format}.`, EXIT_CODES.USAGE);

  const databases = await loadDatabases(global);
  const alternatives = filterAlternatives(findAlternatives(positionals[0], databases.alternativesDatabase), flags);
  if (format === "json") stdout(io, JSON.stringify({ query: positionals[0], alternatives }, null, 2));
  else stdout(io, renderAlternativesMarkdown(positionals[0], alternatives));
  return EXIT_CODES.OK;
}

function policyTemplate(template) {
  const failOn = template === "strict" ? "any-critical" : "new-high";
  return `# scanEUr policy
# Conservative starter policy. Review before using in CI.
schema_version: "0.1"
fail_on: "${failOn}"
baseline_required: false
notes:
  - "By default this policy is intended for new findings or explicit thresholds."
  - "It does not make legal conclusions."
`;
}

async function commandInitPolicy(args, global, io) {
  const { flags, positionals } = parseCommandArgs(args, {
    output: { type: "value" },
    force: { type: "boolean" },
    template: { type: "value" }
  });
  if (positionals.length > 0) throw codeError("init-policy does not take a positional argument.", EXIT_CODES.USAGE);
  const outputPath = flags.output ?? "scaneur.policy.yml";
  const template = flags.template ?? "basic";
  if (!VALID_TEMPLATES.has(template)) throw codeError(`Unsupported policy template: ${template}.`, EXIT_CODES.USAGE);
  if (!flags.force) {
    const existing = await stat(outputPath).catch(() => null);
    if (existing) throw codeError(`Policy already exists: ${outputPath}. Use --force to overwrite.`, EXIT_CODES.OUTPUT);
  }
  await writeOutputFile(outputPath, policyTemplate(template));
  if (!global.quiet) stdout(io, `Created ${outputPath}\nReview the policy before using it in CI.`);
  return EXIT_CODES.OK;
}

async function loadBaseline(baselinePath) {
  if (!baselinePath) return null;
  try {
    return JSON.parse(await readFile(baselinePath, "utf8"));
  } catch (error) {
    throw codeError(`Could not read baseline report: ${error.message}`, EXIT_CODES.USAGE);
  }
}

async function pathExists(filePath) {
  return (await stat(filePath).catch(() => null)) !== null;
}

async function resolvePolicyPath(global, targetPath = null) {
  if (global.config) return path.resolve(global.config);

  const candidates = [path.resolve("scaneur.policy.yml")];
  if (targetPath) candidates.push(path.resolve(targetPath, "scaneur.policy.yml"));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

async function loadPolicy(global, targetPath = null) {
  const policyPath = await resolvePolicyPath(global, targetPath);
  if (!policyPath) return null;
  try {
    const content = await readFile(policyPath, "utf8");
    const match = content.match(/^\s*fail_on:\s*["']?([a-z-]+)["']?\s*$/m);
    return { fail_on: match?.[1] ?? "new-high" };
  } catch (error) {
    throw codeError(`Could not read policy config: ${error.message}`, EXIT_CODES.USAGE);
  }
}

function criticalFinding(finding) {
  return Object.values(finding.scores).includes("critical");
}

function highPriorityIds(report) {
  return new Set(highPriorityFindings(report.findings ?? []).map((finding) => finding.finding_id));
}

function policyTriggered(report, policy, baselineReport) {
  return evaluatePolicy(report, policy, baselineReport).failed;
}

function evaluatePolicy(report, policy, baselineReport) {
  if (!policy) return { failed: false, count: 0 };
  if (!VALID_FAIL_POLICIES.has(policy)) throw codeError(`Unsupported fail policy: ${policy}.`, EXIT_CODES.USAGE);
  if (policy === "policy") return { failed: false, count: 0 };
  if (policy === "any-critical") {
    const count = report.findings.filter(criticalFinding).length;
    return { failed: count > 0, count };
  }
  if (policy === "unknown-critical") {
    const count = report.unknown_candidates.filter((candidate) => candidate.evidence_confidence === "high").length;
    return { failed: count > 0, count };
  }
  if (policy === "new-high") {
    const previous = highPriorityIds(baselineReport ?? { findings: [] });
    const count = highPriorityFindings(report.findings).filter((finding) => !previous.has(finding.finding_id)).length;
    return { failed: count > 0, count };
  }
  return { failed: false, count: 0 };
}

function renderCheckText(policy, evaluation, failed) {
  const baselineLabel = policy === "new-high" ? "New high-priority findings" : "Policy findings";
  return [
    "scanEUr check completed.",
    `Policy: ${policy}`,
    `${baselineLabel}: ${evaluation.count}`,
    `Result: ${failed ? "failed" : "passed"}`
  ].join("\n");
}

async function commandCheck(args, global, io) {
  const { flags, positionals } = parseCommandArgs(args, {
    "fail-on": { type: "value" },
    baseline: { type: "value" },
    format: { type: "value" },
    output: { type: "value" }
  });
  if (!positionals[0]) throw codeError("Missing check path.", EXIT_CODES.USAGE);
  const format = flags.format ?? "text";
  if (!VALID_CHECK_FORMATS.has(format)) throw codeError(`Unsupported check output format: ${format}.`, EXIT_CODES.USAGE);

  const policyConfig = await loadPolicy(global, positionals[0]);
  const policy = flags["fail-on"] ?? policyConfig?.fail_on ?? "policy";
  if (!VALID_FAIL_POLICIES.has(policy)) throw codeError(`Unsupported fail policy: ${policy}.`, EXIT_CODES.USAGE);

  const baseline = await loadBaseline(flags.baseline);
  const report = toReport(await runScan(positionals[0], {}, global));
  const evaluation = evaluatePolicy(report, policy, baseline);
  const failed = evaluation.failed;

  if (flags.output) {
    const outputFormat = path.extname(flags.output).toLowerCase() === ".md" ? "markdown" : "json";
    await writeOutputFile(flags.output, renderReport(report, outputFormat));
  }

  if (format === "json") {
    stdout(io, JSON.stringify({ policy, failed, policy_finding_count: evaluation.count, summary: report.summary }, null, 2));
  } else if (!global.quiet) {
    stdout(io, renderCheckText(policy, evaluation, failed));
  }

  return failed ? EXIT_CODES.POLICY_FAILED : EXIT_CODES.OK;
}

function title(value) {
  return String(value).replaceAll("_", " ").replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

export async function run(argv = process.argv.slice(2), io = process) {
  try {
    const parsed = parseArgv(argv);
    if (parsed.global.version) {
      stdout(io, await cliVersion());
      return EXIT_CODES.OK;
    }
    if (parsed.global.help || !parsed.command) {
      stdout(io, helpText());
      return parsed.command ? EXIT_CODES.OK : EXIT_CODES.USAGE;
    }

    if (parsed.command === "scan") return await commandScan(parsed.args, parsed.global, io);
    if (parsed.command === "explain") return await commandExplain(parsed.args, parsed.global, io);
    if (parsed.command === "alternatives") return await commandAlternatives(parsed.args, parsed.global, io);
    if (parsed.command === "init-policy") return await commandInitPolicy(parsed.args, parsed.global, io);
    if (parsed.command === "check") return await commandCheck(parsed.args, parsed.global, io);

    throw codeError(`Invalid command: ${parsed.command}.`, EXIT_CODES.USAGE);
  } catch (error) {
    stderr(io, error.message || "Internal error.");
    return error.exitCode ?? EXIT_CODES.INTERNAL;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run();
}
