import { assertReport, assertScanResult } from "@scaneur/types";

export const DEFAULT_DISCLAIMER =
  "scanEUr is a technical dependency discovery and review-support tool. It does not provide legal advice, does not determine GDPR compliance or non-compliance, and does not declare any vendor legal or illegal. Findings are based on local file evidence, database profiles, and documented methodology. Manual review is recommended for high-impact decisions.";

const SCORE_LABELS = {
  jurisdiction_signal: "Jurisdiction signal",
  data_sensitivity_signal: "Data sensitivity signal",
  operational_criticality: "Operational criticality",
  migration_effort: "Migration effort",
  alternative_maturity: "Alternative maturity",
  evidence_confidence: "Evidence confidence"
};

const SECRET_ASSIGNMENT = /^\s*([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*=\s*(.+)$/i;
const SECRET_ASSIGNMENT_INLINE = /([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*\s*=\s*)\S+/gi;
const SECRET_PREFIX = /^(?:sk_(?:live|test)_|rk_(?:live|test)_|ghp_|gho_|github_pat_|xox[abprs]-|AKIA[0-9A-Z]{16})/;
const SECRET_PREFIX_INLINE = /(?:sk_(?:live|test)_|rk_(?:live|test)_|ghp_|gho_|github_pat_|xox[abprs]-|AKIA[0-9A-Z]{16})\S*/g;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const JWT = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function toReport(scanResultOrReport, options = {}) {
  if (scanResultOrReport?.report_type === "scaneur_report" || scanResultOrReport?.disclaimer !== undefined) {
    const report = {
      ...scanResultOrReport,
      disclaimer: scanResultOrReport.disclaimer ?? options.disclaimer ?? DEFAULT_DISCLAIMER
    };
    return assertReport(report);
  }

  const scanResult = assertScanResult(scanResultOrReport);
  return assertReport({
    ...scanResult,
    report_type: "scaneur_report",
    disclaimer: options.disclaimer ?? DEFAULT_DISCLAIMER
  });
}

export function renderMarkdownReport(scanResultOrReport, options = {}) {
  const report = toReport(scanResultOrReport, options);
  const lines = [];

  lines.push("# scanEUr Report", "");
  pushSection(lines, "## Executive summary", renderExecutiveSummary(report));
  pushSection(lines, "## Important disclaimer", [report.disclaimer]);
  pushSection(lines, "## Scan metadata", renderScanMetadata(report));
  pushSection(lines, "## High-priority review items", renderFindingList(highPriorityFindings(report.findings), "No high-priority review items detected."));
  pushSection(lines, "## Quick wins", renderFindingList(quickWinFindings(report.findings), "No quick wins identified from the current evidence."));
  pushSection(
    lines,
    "## Strategic dependencies",
    renderFindingList(strategicDependencyFindings(report.findings), "No strategic dependencies identified from the current evidence.")
  );
  pushSection(lines, "## Detected vendors", renderDetectedVendors(report.findings));
  pushSection(lines, "## Unknown vendor candidates", renderUnknownCandidates(report.unknown_candidates));
  pushSection(lines, "## Alternatives overview", renderAlternativesOverview(report.findings));
  pushSection(lines, "## Files scanned", renderFilesScanned(report.files_scanned));
  pushSection(lines, "## Files skipped", renderFilesSkipped(report.files_skipped));
  pushSection(lines, "## Parser warnings", renderParserWarnings(report.parser_warnings));
  pushSection(lines, "## Methodology and scoring", renderMethodology(report));
  pushSection(lines, "## Limitations", renderLimitations(report));

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function pushSection(lines, heading, body) {
  lines.push(heading, "");
  if (body.length === 0) {
    lines.push("_None._", "");
    return;
  }
  lines.push(...body, "");
}

function renderExecutiveSummary(report) {
  return [
    `- Detected vendors: ${numberValue(report.summary.detected_vendor_count)}`,
    `- Unknown candidates: ${numberValue(report.summary.unknown_candidate_count)}`,
    `- High-priority review items: ${numberValue(report.summary.high_priority_review_count)}`,
    `- Quick wins: ${numberValue(report.summary.quick_win_count)}`,
    `- Strategic dependencies: ${numberValue(report.summary.strategic_dependency_count)}`,
    "",
    "This report is based on local file evidence only. It does not prove production usage."
  ];
}

function renderScanMetadata(report) {
  return markdownTable(
    ["Field", "Value"],
    [
      ["Repository path", code(report.scan_metadata.target_path)],
      ["Scan mode", textValue(report.scan_metadata.scan_mode)],
      ["Scanner version", code(report.scan_metadata.scanner_version)],
      ["Database version", code(report.scan_metadata.database_version)],
      ["Methodology version", code(report.scan_metadata.methodology_version)],
      ["Scan started at", code(report.scan_metadata.scan_started_at)],
      ["Scan completed at", code(report.scan_metadata.scan_completed_at)],
      ["Files scanned", numberValue(report.scan_metadata.files_scanned_count)],
      ["Files skipped", numberValue(report.scan_metadata.files_skipped_count)]
    ]
  );
}

function renderDetectedVendors(findings) {
  if (findings.length === 0) return ["No detected vendors."];
  return findings.flatMap((finding) => [`### ${markdownText(finding.vendor_name)}`, "", ...renderFindingDetail(finding)]);
}

function renderFindingList(findings, emptyMessage) {
  if (findings.length === 0) return [emptyMessage];
  return findings.flatMap((finding) => [`### ${markdownText(finding.vendor_name)}`, "", ...renderFindingSummary(finding)]);
}

function renderFindingSummary(finding) {
  return [
    `- Category: ${textValue(finding.category)}`,
    `- Recommendation: ${listCodes(finding.recommendations)}`,
    `- Evidence confidence: ${scoreValue(finding.scores.evidence_confidence)}`,
    `- Manual review recommended: ${finding.manual_review_recommended ? "Yes" : "No"}`,
    ""
  ];
}

function renderFindingDetail(finding) {
  return [
    `- Category: ${textValue(finding.category)}`,
    `- Verification status: ${code(finding.verification_status)}`,
    `- Recommendation: ${listCodes(finding.recommendations)}`,
    `- Manual review recommended: ${finding.manual_review_recommended ? "Yes" : "No"}`,
    "",
    "Scores:",
    "",
    ...renderScores(finding.scores),
    "",
    "Evidence:",
    "",
    ...renderEvidence(finding.evidence),
    "",
    "Observed facts:",
    "",
    ...renderBulletList(finding.observed_facts),
    "",
    "Inferences:",
    "",
    ...renderBulletList(finding.inferences),
    "",
    "Unknowns:",
    "",
    ...renderBulletList(finding.unknowns),
    "",
    "Alternatives:",
    "",
    ...renderAlternatives(finding.alternatives),
    "",
    "Notes and limitations:",
    "",
    ...renderBulletList(finding.limitations),
    ""
  ];
}

function renderScores(scores) {
  return markdownTable(
    ["Dimension", "Score"],
    Object.entries(SCORE_LABELS).map(([key, label]) => [label, scoreValue(scores[key])])
  );
}

function renderEvidence(evidenceItems) {
  if (evidenceItems.length === 0) return ["No evidence items recorded."];
  return markdownTable(
    ["Type", "File", "Value", "Confidence", "Line", "Rule"],
    evidenceItems.map((item) => [
      textValue(item.evidence_type),
      code(item.source_file),
      code(safeEvidenceValue(item)),
      scoreValue(item.confidence),
      item.line_number == null ? "n/a" : numberValue(item.line_number),
      item.matched_rule_id == null ? "n/a" : code(item.matched_rule_id)
    ])
  );
}

function renderAlternatives(alternatives) {
  if (alternatives.length === 0) return ["No alternatives recorded."];
  return markdownTable(
    ["Name", "Replacement", "Fit", "Maturity", "Migration effort", "Known gaps"],
    alternatives.map((alternative) => [
      textValue(alternative.name),
      code(alternative.replacement_type),
      scoreValue(alternative.fit_level),
      scoreValue(alternative.maturity),
      scoreValue(alternative.migration_effort),
      alternative.known_gaps.length === 0 ? "None recorded" : alternative.known_gaps.map(markdownText).join("<br>")
    ])
  );
}

function renderUnknownCandidates(candidates) {
  if (candidates.length === 0) return ["No unknown vendor candidates detected."];
  return candidates.flatMap((candidate) => [
    `### ${markdownText(candidate.normalized_value)}`,
    "",
    `- Candidate type: ${code(candidate.candidate_type)}`,
    `- Evidence confidence: ${scoreValue(candidate.evidence_confidence)}`,
    `- Source files: ${candidate.source_files.length === 0 ? "None recorded" : candidate.source_files.map(code).join(", ")}`,
    `- Reason flagged: ${markdownText(candidate.reason_flagged)}`,
    `- Manual review recommended: ${candidate.manual_review_recommended ? "Yes" : "No"}`,
    "",
    "Unsupported claims:",
    "",
    ...renderBulletList(candidate.unsupported_claims),
    "",
    "Suggested review steps:",
    "",
    ...renderBulletList(candidate.suggested_review_steps),
    ""
  ]);
}

function renderAlternativesOverview(findings) {
  const alternatives = findings.flatMap((finding) =>
    finding.alternatives.map((alternative) => ({
      vendorName: finding.vendor_name,
      ...alternative
    }))
  );
  if (alternatives.length === 0) return ["No alternatives recorded."];
  return markdownTable(
    ["Current vendor", "Alternative", "Replacement", "Fit", "Maturity", "Migration effort"],
    alternatives.map((alternative) => [
      textValue(alternative.vendorName),
      textValue(alternative.name),
      code(alternative.replacement_type),
      scoreValue(alternative.fit_level),
      scoreValue(alternative.maturity),
      scoreValue(alternative.migration_effort)
    ])
  );
}

function renderFilesScanned(files) {
  if (files.length === 0) return ["No scanned files recorded."];
  return markdownTable(
    ["File", "Type", "Parser", "Status"],
    files.map((file) => [code(file.path), textValue(file.file_type), textValue(file.parser), textValue(file.status)])
  );
}

function renderFilesSkipped(files) {
  if (files.length === 0) return ["No skipped files recorded."];
  return markdownTable(
    ["File", "Reason", "User configured"],
    files.map((file) => [code(file.path), textValue(file.reason), file.configured_by_user ? "Yes" : "No"])
  );
}

function renderParserWarnings(warnings) {
  if (warnings.length === 0) return ["No parser warnings."];
  return markdownTable(
    ["File", "Parser", "Warning"],
    warnings.map((warning) => [code(warning.path), textValue(warning.parser), markdownText(warning.message)])
  );
}

function renderMethodology(report) {
  return [
    `- Methodology version: ${code(report.scan_metadata.methodology_version)}`,
    `- Database version: ${code(report.scan_metadata.database_version)}`,
    "- Scores are separate review-support signals, not a single global EU score.",
    "- Facts, inferences, unknowns, and manual review needs are kept separate.",
    "- Evidence confidence uses Low / Medium / High / Unknown labels."
  ];
}

function renderLimitations(report) {
  const limitations = [
    "The scanner reviews local files only and does not verify production usage.",
    "Dependency evidence can indicate planned, historical, test, or transitive usage.",
    "Vendor profiles, database entries, and fingerprints may be incomplete or out of date.",
    "The report is not legal advice and should not be treated as a compliance determination."
  ];
  for (const finding of report.findings) {
    for (const limitation of finding.limitations) limitations.push(`${finding.vendor_name}: ${limitation}`);
  }
  return renderBulletList([...new Set(limitations)]);
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

function renderBulletList(values) {
  if (values.length === 0) return ["- None recorded."];
  return values.map((value) => `- ${markdownText(value)}`);
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(tableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`)
  ];
}

function tableCell(value) {
  return String(value).replaceAll("\n", "<br>").replaceAll("|", "\\|");
}

function scoreValue(value) {
  return titleCaseText(value);
}

function numberValue(value) {
  return String(value);
}

function listCodes(values) {
  if (values.length === 0) return "None recorded";
  return values.map(code).join(", ");
}

function code(value) {
  return `\`${redactSecretsInText(String(value)).replaceAll("`", "\\`")}\``;
}

function textValue(value) {
  return markdownText(String(value).replaceAll("_", " "));
}

function titleCaseText(value) {
  return textValue(value).replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function markdownText(value) {
  return redactSecretsInText(String(value)).replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\n", "<br>");
}

function safeEvidenceValue(item) {
  const value = String(item.matched_value ?? "");
  if (item.redacted) return "[redacted]";

  const assignment = value.match(SECRET_ASSIGNMENT);
  if (assignment) return `${assignment[1]}=[redacted]`;

  if (PRIVATE_KEY_BEGIN.test(value) || SECRET_PREFIX.test(value) || JWT.test(value) || looksLikeHighEntropySecret(value)) {
    return "[redacted]";
  }

  return value;
}

function looksLikeHighEntropySecret(value) {
  if (value.length < 40 || /\s/.test(value)) return false;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  const hasSymbol = /[^A-Za-z0-9._-]/.test(value);
  return [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length >= 3;
}

function redactSecretsInText(value) {
  return value
    .replace(PRIVATE_KEY_BLOCK, "[redacted]")
    .replace(PRIVATE_KEY_BEGIN, "[redacted]")
    .replace(JWT, "[redacted]")
    .replace(SECRET_PREFIX_INLINE, "[redacted]")
    .replace(SECRET_ASSIGNMENT_INLINE, "$1[redacted]");
}
