export const validScores = {
  jurisdiction_signal: "high",
  data_sensitivity_signal: "high",
  operational_criticality: "medium",
  migration_effort: "medium",
  alternative_maturity: "high",
  evidence_confidence: "medium"
};

export const validVendorProfile = {
  id: "ga4",
  name: "Google Analytics 4",
  category: "analytics",
  secondary_categories: ["web_analytics"],
  aliases: ["Google Analytics", "GA4"],
  website: "https://analytics.google.com",
  identifiers: {
    domains: ["analytics.google.com", "www.googletagmanager.com"],
    packages: {
      npm: ["react-ga4"],
      pypi: [],
      other: []
    },
    env_patterns: ["^GA_MEASUREMENT_ID$"],
    docker_images: [],
    github_actions: [],
    config_files: [],
    terraform_providers: []
  },
  jurisdiction: {
    headquarters_country: "unknown_review_required",
    headquarters_region: "Unknown",
    eu_establishment: "unknown",
    data_residency_options: [],
    jurisdiction_notes: "Analytics tools may require privacy, consent, and transfer review."
  },
  ownership_control: {
    control_region: "Unknown",
    parent_company: "unknown",
    publicly_traded: "unknown",
    control_notes: "Review current corporate documentation before verified publication."
  },
  data_categories: {
    likely_personal_data: "high",
    common_data_types: ["IP address", "usage events"],
    sensitive_data_possible: "unknown",
    data_notes: "Actual data depends on configuration and consent mode."
  },
  common_use_cases: ["analytics", "marketing measurement"],
  operational_criticality_default: "medium",
  migration_effort_default: "medium",
  scoring_defaults: validScores,
  recommendation_defaults: {
    categories: ["configure_better", "review_contractually", "monitor"],
    notes: "Analytics may be a practical review area."
  },
  evidence_sources: [],
  verification: {
    status: "agent_draft",
    last_reviewed: "unknown",
    reviewed_by: "unknown",
    review_notes: "Fixture profile only."
  },
  limitations: ["A measurement ID pattern alone does not prove active production tracking."],
  notes: "Use with evidence confidence labels.",
  schema_version: "0.1"
};

export const validFingerprint = {
  id: "fingerprint_example_unknown_analytics_pkg",
  verification_status: "fingerprint_only",
  rule_type: "package",
  match: {
    ecosystem: "npm",
    package_name: "example-analytics-sdk"
  },
  result: {
    vendor_id: null,
    candidate_category: "analytics",
    confidence: "medium",
    evidence_label: "Analytics-like package name",
    manual_review_recommended: true
  },
  limitations: ["No verified vendor profile exists yet."],
  schema_version: "0.1"
};

export const validAlternative = {
  id: "alt_ga4_matomo",
  source: {
    vendor_id: "ga4",
    category: "analytics",
    use_case: "web_analytics"
  },
  alternative: {
    vendor_id: "matomo",
    name: "Matomo",
    type: "open_source",
    website: "https://matomo.org"
  },
  replacement: {
    replacement_type: "partial",
    fit_level: "high",
    maturity: "high",
    migration_effort: "medium",
    alternative_maturity: "high"
  },
  hosting: {
    self_hosting_option: true,
    managed_option: true,
    operational_burden: "medium"
  },
  control_notes: {
    eu_or_european_control_signal: "unknown",
    data_residency_notes: "Depends on self-hosting or managed hosting location.",
    ownership_notes: "Review current project/company details before verification."
  },
  usage_guidance: {
    best_fit_cases: ["Teams needing mature web analytics with self-hosting option."],
    poor_fit_cases: ["Teams deeply dependent on Google Ads attribution workflows."],
    known_gaps: ["May not match all GA4 advertising ecosystem integrations."],
    migration_notes: ["Replace measurement script and validate event model."],
    configuration_notes: ["Consider IP anonymization and data retention settings."]
  },
  ranking: {
    methodology_basis: ["feature_fit", "maturity", "self_hosting_option"],
    commercial_influence: "none",
    affiliate_link: false,
    sponsored: false
  },
  evidence_sources: [],
  verification: {
    status: "agent_draft",
    last_reviewed: "unknown",
    reviewed_by: "unknown"
  },
  limitations: ["Suitability depends on analytics requirements and consent model."],
  schema_version: "0.1"
};

export const validFinding = {
  finding_id: "vendor:ga4",
  finding_type: "known_vendor",
  vendor_id: "ga4",
  vendor_name: "Google Analytics 4",
  category: "analytics",
  verification_status: "agent_draft",
  scores: validScores,
  recommendations: ["configure_better", "review_contractually"],
  observed_facts: ["The package `react-ga4` was found in `package.json`."],
  inferences: ["The project may integrate with Google Analytics."],
  unknowns: ["Production usage was not verified by the scanner."],
  manual_review_recommended: true,
  evidence: [
    {
      evidence_id: "ev_001",
      source_file: "package.json",
      source_type: "package_manifest",
      evidence_type: "package_name",
      matched_value: "react-ga4",
      matched_rule_id: "pkg_ga4_react",
      confidence: "high",
      observed_fact: "The package `react-ga4` was found in `package.json`.",
      inference: "The project may integrate with Google Analytics.",
      line_number: null,
      redacted: false
    }
  ],
  alternatives: [
    {
      alternative_id: "alt_ga4_matomo",
      name: "Matomo",
      replacement_type: "partial",
      fit_level: "high",
      maturity: "high",
      migration_effort: "medium",
      known_gaps: ["May not match all GA4 advertising ecosystem integrations."]
    }
  ],
  limitations: ["A package may indicate planned integration rather than production use."]
};

export const validUnknownCandidate = {
  candidate_id: "unknown:domain:api.example-service.test",
  candidate_type: "external_domain",
  normalized_value: "api.example-service.test",
  source_files: ["vercel.json"],
  reason_flagged: "External-looking API domain did not match a known vendor profile or fingerprint.",
  evidence_confidence: "medium",
  manual_review_recommended: true,
  unsupported_claims: ["vendor identity", "jurisdiction", "ownership/control", "data processing role"],
  suggested_review_steps: [
    "Identify the service owner.",
    "Confirm whether the endpoint is used in production.",
    "Check whether personal data is sent."
  ]
};

export const validScanResult = {
  schema_version: "0.1",
  scan_metadata: {
    scanner_version: "0.1.0",
    database_version: "2026.04.0",
    methodology_version: "0.1.0",
    scan_started_at: "2026-04-30T10:00:00Z",
    scan_completed_at: "2026-04-30T10:00:01Z",
    scan_mode: "local_offline",
    target_path: ".",
    files_scanned_count: 1,
    files_skipped_count: 1
  },
  summary: {
    detected_vendor_count: 1,
    unknown_candidate_count: 1,
    high_priority_review_count: 0,
    quick_win_count: 0,
    strategic_dependency_count: 0
  },
  findings: [validFinding],
  unknown_candidates: [validUnknownCandidate],
  files_scanned: [
    {
      path: "package.json",
      file_type: "package_manifest",
      parser: "package_json",
      status: "scanned"
    }
  ],
  files_skipped: [
    {
      path: ".env",
      reason: "sensitive_file_default_skip",
      configured_by_user: false
    }
  ],
  parser_warnings: []
};

export const validReport = {
  schema_version: "0.1",
  report_type: "scaneur_report",
  scan_metadata: validScanResult.scan_metadata,
  summary: validScanResult.summary,
  findings: validScanResult.findings,
  unknown_candidates: validScanResult.unknown_candidates,
  files_scanned: validScanResult.files_scanned,
  files_skipped: validScanResult.files_skipped,
  parser_warnings: validScanResult.parser_warnings,
  disclaimer:
    "scanEUr is a technical dependency discovery and review-support tool. It does not provide legal advice, does not determine GDPR compliance or non-compliance, and does not declare any vendor legal or illegal. Findings are based on local file evidence, database profiles, and documented methodology. Manual review is recommended for high-impact decisions."
};
