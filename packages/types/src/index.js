const lowerSlugPattern = /^[a-z0-9][a-z0-9_-]*$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const VERIFICATION_STATUSES = [
  "verified",
  "partially_verified",
  "fingerprint_only",
  "agent_draft",
  "unknown"
];

export const ALTERNATIVE_VERIFICATION_STATUSES = [
  "verified",
  "partially_verified",
  "agent_draft",
  "unknown"
];

export const JURISDICTION_REGIONS = [
  "EU",
  "EEA",
  "Europe_non_EU",
  "US",
  "UK",
  "Other",
  "Unknown"
];

export const CONTROL_REGIONS = [...JURISDICTION_REGIONS, "Mixed"];

export const TRI_STATE_VALUES = [true, false, "unknown"];

export const SEVERITY_SCORES = ["low", "medium", "high", "critical", "unknown"];
export const MATURITY_SCORES = ["low", "medium", "high", "unknown"];
export const EVIDENCE_CONFIDENCE_SCORES = ["low", "medium", "high", "unknown"];
export const PERSONAL_DATA_LEVELS = ["low", "medium", "high", "unknown"];

export const RECOMMENDATION_CATEGORIES = [
  "replace_now",
  "configure_better",
  "review_contractually",
  "monitor",
  "keep_for_now",
  "strategic_migration_only",
  "manual_review_required"
];

export const VENDOR_EVIDENCE_SOURCE_TYPES = [
  "official",
  "documentation",
  "legal",
  "registry",
  "other"
];

export const ALTERNATIVE_EVIDENCE_SOURCE_TYPES = [
  "official",
  "documentation",
  "other"
];

export const ALTERNATIVE_TYPES = [
  "eu_saas",
  "european_controlled",
  "open_source",
  "self_hosted",
  "partial_replacement",
  "configure_better",
  "no_good_equivalent"
];

export const REPLACEMENT_TYPES = [
  "full",
  "partial",
  "complementary",
  "configuration_only",
  "strategic_only",
  "unknown"
];

export const FINGERPRINT_RULE_TYPES = [
  "package",
  "env_var",
  "domain",
  "docker_image",
  "github_action",
  "config_file",
  "terraform_provider",
  "text_pattern"
];

export const SOURCE_TYPES = [
  "package_manifest",
  "lockfile",
  "env_template",
  "config_file",
  "workflow",
  "dockerfile",
  "terraform",
  "text",
  "unknown"
];

export const EVIDENCE_TYPES = [
  "package_name",
  "env_var",
  "domain",
  "docker_image",
  "github_action",
  "config_file",
  "terraform_provider",
  "text_pattern"
];

export const FINDING_TYPES = ["known_vendor", "fingerprint_only"];

export const UNKNOWN_CANDIDATE_TYPES = [
  "external_domain",
  "env_prefix",
  "github_action",
  "docker_image",
  "package",
  "config_reference"
];

export const FILE_SKIP_REASONS = [
  "ignored_directory",
  "unsupported_file_type",
  "sensitive_file_default_skip",
  "file_too_large",
  "unreadable",
  "user_excluded"
];

const SCORE_KEYS = [
  "jurisdiction_signal",
  "data_sensitivity_signal",
  "operational_criticality",
  "migration_effort",
  "alternative_maturity",
  "evidence_confidence"
];

const GLOBAL_SCORE_KEYS = [
  "eu_score",
  "global_eu_score",
  "overall_eu_score",
  "sovereignty_score"
];

function issue(path, message) {
  return { path, message };
}

function fieldPath(path, key) {
  return path ? `${path}.${key}` : key;
}

function createContext() {
  return {
    errors: [],
    add(path, message) {
      this.errors.push(issue(path, message));
    }
  };
}

function ok(input, errors) {
  return errors.length === 0
    ? { success: true, data: input, errors: [] }
    : { success: false, errors };
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function object(ctx, value, path) {
  if (!isRecord(value)) {
    ctx.add(path, `expected object, received ${typeName(value)}`);
    return false;
  }
  return true;
}

function string(ctx, value, path, { allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    ctx.add(path, `expected string, received ${typeName(value)}`);
    return false;
  }
  if (!allowEmpty && value.trim() === "") {
    ctx.add(path, "expected non-empty string");
    return false;
  }
  return true;
}

function nullableString(ctx, value, path) {
  if (value === null) return true;
  return string(ctx, value, path);
}

function unknownableString(ctx, value, path) {
  if (value === "unknown") return true;
  return string(ctx, value, path);
}

function boolean(ctx, value, path) {
  if (typeof value !== "boolean") {
    ctx.add(path, `expected boolean, received ${typeName(value)}`);
    return false;
  }
  return true;
}

function integer(ctx, value, path) {
  if (!Number.isInteger(value) || value < 0) {
    ctx.add(path, "expected non-negative integer");
    return false;
  }
  return true;
}

function nullableInteger(ctx, value, path) {
  if (value === null) return true;
  return integer(ctx, value, path);
}

function triState(ctx, value, path) {
  if (!TRI_STATE_VALUES.includes(value)) {
    ctx.add(path, "expected true, false, or \"unknown\"");
    return false;
  }
  return true;
}

function enumeration(ctx, value, path, values) {
  if (!values.includes(value)) {
    ctx.add(path, `expected one of: ${values.join(", ")}`);
    return false;
  }
  return true;
}

function array(ctx, value, path, itemValidator) {
  if (!Array.isArray(value)) {
    ctx.add(path, `expected array, received ${typeName(value)}`);
    return false;
  }
  value.forEach((item, index) => itemValidator(item, `${path}[${index}]`));
  return true;
}

function stringArray(ctx, value, path) {
  return array(ctx, value, path, (item, itemPath) => string(ctx, item, itemPath));
}

function dateOrUnknown(ctx, value, path) {
  if (value === "unknown") return true;
  if (!string(ctx, value, path)) return false;
  if (!isoDatePattern.test(value)) {
    ctx.add(path, "expected ISO date YYYY-MM-DD or \"unknown\"");
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    ctx.add(path, "expected valid calendar date YYYY-MM-DD or \"unknown\"");
    return false;
  }
  return true;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function dateTime(ctx, value, path) {
  if (!string(ctx, value, path)) return false;
  if (Number.isNaN(Date.parse(value))) {
    ctx.add(path, "expected ISO date-time string");
    return false;
  }
  return true;
}

function lowerSlug(ctx, value, path) {
  if (!string(ctx, value, path)) return false;
  if (!lowerSlugPattern.test(value)) {
    ctx.add(path, "expected stable lowercase slug");
    return false;
  }
  return true;
}

function nullableLowerSlug(ctx, value, path) {
  if (value === null) return true;
  return lowerSlug(ctx, value, path);
}

function noUnknownKeys(ctx, value, path, keys) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      ctx.add(path ? `${path}.${key}` : key, "unexpected field");
    }
  }
}

function requireKeys(ctx, value, path, keys) {
  for (const key of keys) {
    if (!(key in value)) {
      ctx.add(path ? `${path}.${key}` : key, "missing required field");
    }
  }
}

function strictObject(ctx, value, path, keys) {
  if (!object(ctx, value, path)) return false;
  requireKeys(ctx, value, path, keys);
  noUnknownKeys(ctx, value, path, keys);
  return true;
}

function scoreDimensions(ctx, value, path) {
  if (!object(ctx, value, path)) return;

  for (const key of GLOBAL_SCORE_KEYS) {
    if (key in value) {
      ctx.add(
        fieldPath(path, key),
        "global EU scores are not part of scanEUr; use separate scoring dimensions"
      );
    }
  }

  strictObject(ctx, value, path, SCORE_KEYS);
  enumeration(ctx, value.jurisdiction_signal, fieldPath(path, "jurisdiction_signal"), SEVERITY_SCORES);
  enumeration(ctx, value.data_sensitivity_signal, fieldPath(path, "data_sensitivity_signal"), SEVERITY_SCORES);
  enumeration(ctx, value.operational_criticality, fieldPath(path, "operational_criticality"), SEVERITY_SCORES);
  enumeration(ctx, value.migration_effort, fieldPath(path, "migration_effort"), SEVERITY_SCORES);
  enumeration(ctx, value.alternative_maturity, fieldPath(path, "alternative_maturity"), MATURITY_SCORES);
  enumeration(ctx, value.evidence_confidence, fieldPath(path, "evidence_confidence"), EVIDENCE_CONFIDENCE_SCORES);
}

function evidenceSource(ctx, value, path, sourceTypes) {
  const keys = ["title", "url", "source_type", "supports", "retrieved_at"];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.title, `${path}.title`);
  string(ctx, value.url, `${path}.url`);
  enumeration(ctx, value.source_type, `${path}.source_type`, sourceTypes);
  stringArray(ctx, value.supports, `${path}.supports`);
  dateOrUnknown(ctx, value.retrieved_at, `${path}.retrieved_at`);
}

function verification(ctx, value, path, statuses, includeNotes = false) {
  const keys = includeNotes
    ? ["status", "last_reviewed", "reviewed_by", "review_notes"]
    : ["status", "last_reviewed", "reviewed_by"];
  if (!strictObject(ctx, value, path, keys)) return;
  enumeration(ctx, value.status, `${path}.status`, statuses);
  dateOrUnknown(ctx, value.last_reviewed, `${path}.last_reviewed`);
  unknownableString(ctx, value.reviewed_by, `${path}.reviewed_by`);
  if (includeNotes) string(ctx, value.review_notes, `${path}.review_notes`, { allowEmpty: true });
}

function identifiers(ctx, value, path) {
  const keys = [
    "domains",
    "packages",
    "env_patterns",
    "docker_images",
    "github_actions",
    "config_files",
    "terraform_providers"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  stringArray(ctx, value.domains, `${path}.domains`);
  const packageKeys = ["npm", "pypi", "other"];
  if (strictObject(ctx, value.packages, `${path}.packages`, packageKeys)) {
    stringArray(ctx, value.packages.npm, `${path}.packages.npm`);
    stringArray(ctx, value.packages.pypi, `${path}.packages.pypi`);
    stringArray(ctx, value.packages.other, `${path}.packages.other`);
  }
  stringArray(ctx, value.env_patterns, `${path}.env_patterns`);
  stringArray(ctx, value.docker_images, `${path}.docker_images`);
  stringArray(ctx, value.github_actions, `${path}.github_actions`);
  stringArray(ctx, value.config_files, `${path}.config_files`);
  stringArray(ctx, value.terraform_providers, `${path}.terraform_providers`);
}

function vendorJurisdiction(ctx, value, path) {
  const keys = [
    "headquarters_country",
    "headquarters_region",
    "eu_establishment",
    "data_residency_options",
    "jurisdiction_notes"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  unknownableString(ctx, value.headquarters_country, `${path}.headquarters_country`);
  enumeration(ctx, value.headquarters_region, `${path}.headquarters_region`, JURISDICTION_REGIONS);
  triState(ctx, value.eu_establishment, `${path}.eu_establishment`);
  stringArray(ctx, value.data_residency_options, `${path}.data_residency_options`);
  string(ctx, value.jurisdiction_notes, `${path}.jurisdiction_notes`, { allowEmpty: true });
}

function ownershipControl(ctx, value, path) {
  const keys = ["control_region", "parent_company", "publicly_traded", "control_notes"];
  if (!strictObject(ctx, value, path, keys)) return;
  enumeration(ctx, value.control_region, `${path}.control_region`, CONTROL_REGIONS);
  unknownableString(ctx, value.parent_company, `${path}.parent_company`);
  triState(ctx, value.publicly_traded, `${path}.publicly_traded`);
  string(ctx, value.control_notes, `${path}.control_notes`, { allowEmpty: true });
}

function dataCategories(ctx, value, path) {
  const keys = ["likely_personal_data", "common_data_types", "sensitive_data_possible", "data_notes"];
  if (!strictObject(ctx, value, path, keys)) return;
  enumeration(ctx, value.likely_personal_data, `${path}.likely_personal_data`, PERSONAL_DATA_LEVELS);
  stringArray(ctx, value.common_data_types, `${path}.common_data_types`);
  triState(ctx, value.sensitive_data_possible, `${path}.sensitive_data_possible`);
  string(ctx, value.data_notes, `${path}.data_notes`, { allowEmpty: true });
}

function recommendationDefaults(ctx, value, path) {
  const keys = ["categories", "notes"];
  if (!strictObject(ctx, value, path, keys)) return;
  array(ctx, value.categories, `${path}.categories`, (item, itemPath) =>
    enumeration(ctx, item, itemPath, RECOMMENDATION_CATEGORIES)
  );
  string(ctx, value.notes, `${path}.notes`, { allowEmpty: true });
}

export function validateScores(input) {
  const ctx = createContext();
  scoreDimensions(ctx, input, "");
  return ok(input, ctx.errors);
}

export function validateVendorProfile(input) {
  const ctx = createContext();
  const keys = [
    "id",
    "name",
    "category",
    "secondary_categories",
    "aliases",
    "website",
    "identifiers",
    "jurisdiction",
    "ownership_control",
    "data_categories",
    "common_use_cases",
    "operational_criticality_default",
    "migration_effort_default",
    "scoring_defaults",
    "recommendation_defaults",
    "evidence_sources",
    "verification",
    "limitations",
    "notes",
    "schema_version"
  ];

  if (!strictObject(ctx, input, "", keys)) return ok(input, ctx.errors);
  lowerSlug(ctx, input.id, "id");
  string(ctx, input.name, "name");
  string(ctx, input.category, "category");
  stringArray(ctx, input.secondary_categories, "secondary_categories");
  stringArray(ctx, input.aliases, "aliases");
  string(ctx, input.website, "website");
  identifiers(ctx, input.identifiers, "identifiers");
  vendorJurisdiction(ctx, input.jurisdiction, "jurisdiction");
  ownershipControl(ctx, input.ownership_control, "ownership_control");
  dataCategories(ctx, input.data_categories, "data_categories");
  stringArray(ctx, input.common_use_cases, "common_use_cases");
  enumeration(
    ctx,
    input.operational_criticality_default,
    "operational_criticality_default",
    SEVERITY_SCORES
  );
  enumeration(ctx, input.migration_effort_default, "migration_effort_default", SEVERITY_SCORES);
  scoreDimensions(ctx, input.scoring_defaults, "scoring_defaults");
  recommendationDefaults(ctx, input.recommendation_defaults, "recommendation_defaults");
  array(ctx, input.evidence_sources, "evidence_sources", (item, itemPath) =>
    evidenceSource(ctx, item, itemPath, VENDOR_EVIDENCE_SOURCE_TYPES)
  );
  verification(ctx, input.verification, "verification", VERIFICATION_STATUSES, true);
  if (input.verification?.status === "verified" && input.evidence_sources?.length === 0) {
    ctx.add("evidence_sources", "verified vendor profiles require at least one evidence source");
  }
  if (input.verification?.status === "verified" && input.verification.last_reviewed === "unknown") {
    ctx.add("verification.last_reviewed", "verified vendor profiles require a concrete last_reviewed date");
  }
  stringArray(ctx, input.limitations, "limitations");
  string(ctx, input.notes, "notes", { allowEmpty: true });
  string(ctx, input.schema_version, "schema_version");
  return ok(input, ctx.errors);
}

function fingerprintMatch(ctx, value, path, ruleType) {
  if (!object(ctx, value, path)) return;
  switch (ruleType) {
    case "package":
      strictObject(ctx, value, path, ["ecosystem", "package_name"]);
      string(ctx, value.ecosystem, `${path}.ecosystem`);
      string(ctx, value.package_name, `${path}.package_name`);
      break;
    case "env_var":
      strictObject(ctx, value, path, ["pattern", "case_sensitive"]);
      string(ctx, value.pattern, `${path}.pattern`);
      boolean(ctx, value.case_sensitive, `${path}.case_sensitive`);
      break;
    case "domain":
      strictObject(ctx, value, path, ["domains"]);
      stringArray(ctx, value.domains, `${path}.domains`);
      break;
    case "docker_image":
      strictObject(ctx, value, path, ["image_patterns"]);
      stringArray(ctx, value.image_patterns, `${path}.image_patterns`);
      break;
    case "github_action":
      strictObject(ctx, value, path, ["action"]);
      string(ctx, value.action, `${path}.action`);
      break;
    case "config_file":
      strictObject(ctx, value, path, ["paths"]);
      stringArray(ctx, value.paths, `${path}.paths`);
      break;
    case "terraform_provider":
      strictObject(ctx, value, path, ["provider_names"]);
      stringArray(ctx, value.provider_names, `${path}.provider_names`);
      break;
    case "text_pattern":
      strictObject(ctx, value, path, ["regex", "supported_file_types"]);
      string(ctx, value.regex, `${path}.regex`);
      stringArray(ctx, value.supported_file_types, `${path}.supported_file_types`);
      break;
    default:
      break;
  }
}

function fingerprintResult(ctx, value, path) {
  const keys = [
    "vendor_id",
    "candidate_category",
    "confidence",
    "evidence_label",
    "observed_fact",
    "inference",
    "manual_review_recommended"
  ];
  if (!object(ctx, value, path)) return;
  for (const key of ["vendor_id", "candidate_category", "observed_fact", "inference", "manual_review_recommended"]) {
    if (!(key in value)) continue;
    if (key === "vendor_id") nullableLowerSlug(ctx, value[key], `${path}.${key}`);
    if (key === "candidate_category") nullableString(ctx, value[key], `${path}.${key}`);
    if (key === "observed_fact" || key === "inference") string(ctx, value[key], `${path}.${key}`);
    if (key === "manual_review_recommended") boolean(ctx, value[key], `${path}.${key}`);
  }
  requireKeys(ctx, value, path, ["vendor_id", "confidence", "evidence_label"]);
  noUnknownKeys(ctx, value, path, keys);
  enumeration(ctx, value.confidence, `${path}.confidence`, EVIDENCE_CONFIDENCE_SCORES);
  string(ctx, value.evidence_label, `${path}.evidence_label`);
  if (value.vendor_id === null && !value.candidate_category) {
    ctx.add(`${path}.candidate_category`, "required when vendor_id is null");
  }
}

export function validateFingerprint(input) {
  const ctx = createContext();
  const keys = [
    "id",
    "verification_status",
    "rule_type",
    "match",
    "result",
    "limitations",
    "schema_version"
  ];
  if (!strictObject(ctx, input, "", keys)) return ok(input, ctx.errors);
  lowerSlug(ctx, input.id, "id");
  enumeration(ctx, input.verification_status, "verification_status", [
    "fingerprint_only",
    "partially_verified",
    "agent_draft"
  ]);
  enumeration(ctx, input.rule_type, "rule_type", FINGERPRINT_RULE_TYPES);
  fingerprintMatch(ctx, input.match, "match", input.rule_type);
  fingerprintResult(ctx, input.result, "result");
  stringArray(ctx, input.limitations, "limitations");
  string(ctx, input.schema_version, "schema_version");
  return ok(input, ctx.errors);
}

function alternativeSource(ctx, value, path) {
  const keys = ["vendor_id", "category", "use_case"];
  if (!strictObject(ctx, value, path, keys)) return;
  nullableLowerSlug(ctx, value.vendor_id, `${path}.vendor_id`);
  string(ctx, value.category, `${path}.category`);
  nullableString(ctx, value.use_case, `${path}.use_case`);
}

function alternativeIdentity(ctx, value, path) {
  const keys = ["vendor_id", "name", "type", "website"];
  if (!strictObject(ctx, value, path, keys)) return;
  nullableLowerSlug(ctx, value.vendor_id, `${path}.vendor_id`);
  string(ctx, value.name, `${path}.name`);
  enumeration(ctx, value.type, `${path}.type`, ALTERNATIVE_TYPES);
  nullableString(ctx, value.website, `${path}.website`);
}

function alternativeReplacement(ctx, value, path) {
  const keys = ["replacement_type", "fit_level", "maturity", "migration_effort", "alternative_maturity"];
  if (!strictObject(ctx, value, path, keys)) return;
  enumeration(ctx, value.replacement_type, `${path}.replacement_type`, REPLACEMENT_TYPES);
  enumeration(ctx, value.fit_level, `${path}.fit_level`, MATURITY_SCORES);
  enumeration(ctx, value.maturity, `${path}.maturity`, MATURITY_SCORES);
  enumeration(ctx, value.migration_effort, `${path}.migration_effort`, SEVERITY_SCORES);
  enumeration(ctx, value.alternative_maturity, `${path}.alternative_maturity`, MATURITY_SCORES);
}

function alternativeHosting(ctx, value, path) {
  const keys = ["self_hosting_option", "managed_option", "operational_burden"];
  if (!strictObject(ctx, value, path, keys)) return;
  triState(ctx, value.self_hosting_option, `${path}.self_hosting_option`);
  triState(ctx, value.managed_option, `${path}.managed_option`);
  enumeration(ctx, value.operational_burden, `${path}.operational_burden`, SEVERITY_SCORES);
}

function alternativeControlNotes(ctx, value, path) {
  const keys = ["eu_or_european_control_signal", "data_residency_notes", "ownership_notes"];
  if (!strictObject(ctx, value, path, keys)) return;
  enumeration(ctx, value.eu_or_european_control_signal, `${path}.eu_or_european_control_signal`, MATURITY_SCORES);
  string(ctx, value.data_residency_notes, `${path}.data_residency_notes`, { allowEmpty: true });
  string(ctx, value.ownership_notes, `${path}.ownership_notes`, { allowEmpty: true });
}

function alternativeUsageGuidance(ctx, value, path) {
  const keys = ["best_fit_cases", "poor_fit_cases", "known_gaps", "migration_notes", "configuration_notes"];
  if (!strictObject(ctx, value, path, keys)) return;
  for (const key of keys) stringArray(ctx, value[key], `${path}.${key}`);
}

function alternativeRanking(ctx, value, path) {
  const keys = ["methodology_basis", "commercial_influence", "affiliate_link", "sponsored"];
  if (!strictObject(ctx, value, path, keys)) return;
  stringArray(ctx, value.methodology_basis, `${path}.methodology_basis`);
  if (value.commercial_influence !== "none") {
    ctx.add(`${path}.commercial_influence`, "expected \"none\"");
  }
  boolean(ctx, value.affiliate_link, `${path}.affiliate_link`);
  boolean(ctx, value.sponsored, `${path}.sponsored`);
  if (value.affiliate_link) ctx.add(`${path}.affiliate_link`, "affiliate links are not allowed");
  if (value.sponsored) ctx.add(`${path}.sponsored`, "sponsored rankings are not allowed");
}

export function validateAlternative(input) {
  const ctx = createContext();
  const keys = [
    "id",
    "source",
    "alternative",
    "replacement",
    "hosting",
    "control_notes",
    "usage_guidance",
    "ranking",
    "evidence_sources",
    "verification",
    "limitations",
    "schema_version"
  ];
  if (!strictObject(ctx, input, "", keys)) return ok(input, ctx.errors);
  lowerSlug(ctx, input.id, "id");
  alternativeSource(ctx, input.source, "source");
  alternativeIdentity(ctx, input.alternative, "alternative");
  alternativeReplacement(ctx, input.replacement, "replacement");
  alternativeHosting(ctx, input.hosting, "hosting");
  alternativeControlNotes(ctx, input.control_notes, "control_notes");
  alternativeUsageGuidance(ctx, input.usage_guidance, "usage_guidance");
  alternativeRanking(ctx, input.ranking, "ranking");
  array(ctx, input.evidence_sources, "evidence_sources", (item, itemPath) =>
    evidenceSource(ctx, item, itemPath, ALTERNATIVE_EVIDENCE_SOURCE_TYPES)
  );
  verification(ctx, input.verification, "verification", ALTERNATIVE_VERIFICATION_STATUSES);
  stringArray(ctx, input.limitations, "limitations");
  string(ctx, input.schema_version, "schema_version");
  return ok(input, ctx.errors);
}

function evidenceItem(ctx, value, path) {
  const keys = [
    "evidence_id",
    "source_file",
    "source_type",
    "evidence_type",
    "matched_value",
    "matched_rule_id",
    "confidence",
    "observed_fact",
    "inference",
    "line_number",
    "redacted"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.evidence_id, `${path}.evidence_id`);
  string(ctx, value.source_file, `${path}.source_file`);
  enumeration(ctx, value.source_type, `${path}.source_type`, SOURCE_TYPES);
  enumeration(ctx, value.evidence_type, `${path}.evidence_type`, EVIDENCE_TYPES);
  string(ctx, value.matched_value, `${path}.matched_value`);
  nullableString(ctx, value.matched_rule_id, `${path}.matched_rule_id`);
  enumeration(ctx, value.confidence, `${path}.confidence`, EVIDENCE_CONFIDENCE_SCORES);
  string(ctx, value.observed_fact, `${path}.observed_fact`);
  string(ctx, value.inference, `${path}.inference`);
  nullableInteger(ctx, value.line_number, `${path}.line_number`);
  boolean(ctx, value.redacted, `${path}.redacted`);
}

function findingAlternativeSummary(ctx, value, path) {
  const keys = [
    "alternative_id",
    "name",
    "replacement_type",
    "fit_level",
    "maturity",
    "migration_effort",
    "known_gaps"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.alternative_id, `${path}.alternative_id`);
  string(ctx, value.name, `${path}.name`);
  enumeration(ctx, value.replacement_type, `${path}.replacement_type`, REPLACEMENT_TYPES);
  enumeration(ctx, value.fit_level, `${path}.fit_level`, MATURITY_SCORES);
  enumeration(ctx, value.maturity, `${path}.maturity`, MATURITY_SCORES);
  enumeration(ctx, value.migration_effort, `${path}.migration_effort`, SEVERITY_SCORES);
  stringArray(ctx, value.known_gaps, `${path}.known_gaps`);
}

export function validateFinding(input) {
  const ctx = createContext();
  finding(ctx, input, "");
  return ok(input, ctx.errors);
}

function finding(ctx, value, path) {
  const keys = [
    "finding_id",
    "finding_type",
    "vendor_id",
    "vendor_name",
    "category",
    "verification_status",
    "scores",
    "recommendations",
    "observed_facts",
    "inferences",
    "unknowns",
    "manual_review_recommended",
    "evidence",
    "alternatives",
    "limitations"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.finding_id, `${path}.finding_id`);
  enumeration(ctx, value.finding_type, `${path}.finding_type`, FINDING_TYPES);
  nullableLowerSlug(ctx, value.vendor_id, `${path}.vendor_id`);
  string(ctx, value.vendor_name, `${path}.vendor_name`);
  string(ctx, value.category, `${path}.category`);
  enumeration(ctx, value.verification_status, `${path}.verification_status`, VERIFICATION_STATUSES);
  scoreDimensions(ctx, value.scores, `${path}.scores`);
  array(ctx, value.recommendations, `${path}.recommendations`, (item, itemPath) =>
    enumeration(ctx, item, itemPath, RECOMMENDATION_CATEGORIES)
  );
  stringArray(ctx, value.observed_facts, `${path}.observed_facts`);
  stringArray(ctx, value.inferences, `${path}.inferences`);
  stringArray(ctx, value.unknowns, `${path}.unknowns`);
  boolean(ctx, value.manual_review_recommended, `${path}.manual_review_recommended`);
  array(ctx, value.evidence, `${path}.evidence`, (item, itemPath) => evidenceItem(ctx, item, itemPath));
  array(ctx, value.alternatives, `${path}.alternatives`, (item, itemPath) =>
    findingAlternativeSummary(ctx, item, itemPath)
  );
  stringArray(ctx, value.limitations, `${path}.limitations`);
}

function unknownCandidate(ctx, value, path) {
  const keys = [
    "candidate_id",
    "candidate_type",
    "normalized_value",
    "source_files",
    "reason_flagged",
    "evidence_confidence",
    "manual_review_recommended",
    "unsupported_claims",
    "suggested_review_steps"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.candidate_id, `${path}.candidate_id`);
  enumeration(ctx, value.candidate_type, `${path}.candidate_type`, UNKNOWN_CANDIDATE_TYPES);
  string(ctx, value.normalized_value, `${path}.normalized_value`);
  stringArray(ctx, value.source_files, `${path}.source_files`);
  string(ctx, value.reason_flagged, `${path}.reason_flagged`);
  enumeration(ctx, value.evidence_confidence, `${path}.evidence_confidence`, EVIDENCE_CONFIDENCE_SCORES);
  boolean(ctx, value.manual_review_recommended, `${path}.manual_review_recommended`);
  stringArray(ctx, value.unsupported_claims, `${path}.unsupported_claims`);
  stringArray(ctx, value.suggested_review_steps, `${path}.suggested_review_steps`);
}

function fileScanned(ctx, value, path) {
  const keys = ["path", "file_type", "parser", "status"];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.path, `${path}.path`);
  string(ctx, value.file_type, `${path}.file_type`);
  string(ctx, value.parser, `${path}.parser`);
  enumeration(ctx, value.status, `${path}.status`, ["scanned"]);
}

function fileSkipped(ctx, value, path) {
  const keys = ["path", "reason", "configured_by_user"];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.path, `${path}.path`);
  enumeration(ctx, value.reason, `${path}.reason`, FILE_SKIP_REASONS);
  boolean(ctx, value.configured_by_user, `${path}.configured_by_user`);
}

function parserWarning(ctx, value, path) {
  const keys = ["path", "parser", "message"];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.path, `${path}.path`);
  string(ctx, value.parser, `${path}.parser`);
  string(ctx, value.message, `${path}.message`);
}

function scanMetadata(ctx, value, path) {
  const keys = [
    "scanner_version",
    "database_version",
    "methodology_version",
    "scan_started_at",
    "scan_completed_at",
    "scan_mode",
    "target_path",
    "files_scanned_count",
    "files_skipped_count"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  string(ctx, value.scanner_version, `${path}.scanner_version`);
  string(ctx, value.database_version, `${path}.database_version`);
  string(ctx, value.methodology_version, `${path}.methodology_version`);
  dateTime(ctx, value.scan_started_at, `${path}.scan_started_at`);
  dateTime(ctx, value.scan_completed_at, `${path}.scan_completed_at`);
  string(ctx, value.scan_mode, `${path}.scan_mode`);
  string(ctx, value.target_path, `${path}.target_path`);
  integer(ctx, value.files_scanned_count, `${path}.files_scanned_count`);
  integer(ctx, value.files_skipped_count, `${path}.files_skipped_count`);
}

function summary(ctx, value, path) {
  const keys = [
    "detected_vendor_count",
    "unknown_candidate_count",
    "high_priority_review_count",
    "quick_win_count",
    "strategic_dependency_count"
  ];
  if (!strictObject(ctx, value, path, keys)) return;
  for (const key of keys) integer(ctx, value[key], `${path}.${key}`);
}

function reportCore(ctx, value, requireReportFields) {
  const keys = [
    "schema_version",
    ...(requireReportFields ? ["report_type"] : []),
    "scan_metadata",
    "summary",
    "findings",
    "unknown_candidates",
    "files_scanned",
    "files_skipped",
    "parser_warnings",
    ...(requireReportFields ? ["disclaimer"] : [])
  ];
  if (!strictObject(ctx, value, "", keys)) return;
  string(ctx, value.schema_version, "schema_version");
  if (requireReportFields) {
    if (value.report_type !== "scaneur_report") ctx.add("report_type", "expected \"scaneur_report\"");
    disclaimer(ctx, value.disclaimer, "disclaimer");
  }
  scanMetadata(ctx, value.scan_metadata, "scan_metadata");
  summary(ctx, value.summary, "summary");
  array(ctx, value.findings, "findings", (item, itemPath) => finding(ctx, item, itemPath));
  array(ctx, value.unknown_candidates, "unknown_candidates", (item, itemPath) =>
    unknownCandidate(ctx, item, itemPath)
  );
  array(ctx, value.files_scanned, "files_scanned", (item, itemPath) => fileScanned(ctx, item, itemPath));
  array(ctx, value.files_skipped, "files_skipped", (item, itemPath) => fileSkipped(ctx, item, itemPath));
  array(ctx, value.parser_warnings, "parser_warnings", (item, itemPath) => parserWarning(ctx, item, itemPath));
}

function disclaimer(ctx, value, path) {
  if (!string(ctx, value, path)) return;
  const normalized = value.toLowerCase().replaceAll("‑", "-").replaceAll("–", "-");
  const requiredFragments = [
    "technical dependency discovery",
    "does not provide legal advice",
    "does not determine gdpr compliance",
    "does not declare any vendor legal or illegal",
    "manual review"
  ];
  for (const fragment of requiredFragments) {
    if (!normalized.includes(fragment)) {
      ctx.add(path, `missing required disclaimer language: ${fragment}`);
    }
  }
}

export function validateScanResult(input) {
  const ctx = createContext();
  reportCore(ctx, input, false);
  return ok(input, ctx.errors);
}

export function validateReport(input) {
  const ctx = createContext();
  reportCore(ctx, input, true);
  return ok(input, ctx.errors);
}

export function formatValidationErrors(errors) {
  return errors.map((error) => `${error.path || "<root>"}: ${error.message}`).join("\n");
}

function assertWith(validator, input, label) {
  const result = validator(input);
  if (!result.success) {
    throw new Error(`${label} validation failed:\n${formatValidationErrors(result.errors)}`);
  }
  return input;
}

export const assertScores = (input) => assertWith(validateScores, input, "Scores");
export const assertVendorProfile = (input) => assertWith(validateVendorProfile, input, "Vendor profile");
export const assertFingerprint = (input) => assertWith(validateFingerprint, input, "Fingerprint");
export const assertAlternative = (input) => assertWith(validateAlternative, input, "Alternative");
export const assertFinding = (input) => assertWith(validateFinding, input, "Finding");
export const assertScanResult = (input) => assertWith(validateScanResult, input, "Scan result");
export const assertReport = (input) => assertWith(validateReport, input, "Report");

export const schemas = {
  scores: { validate: validateScores, assert: assertScores },
  vendorProfile: { validate: validateVendorProfile, assert: assertVendorProfile },
  fingerprint: { validate: validateFingerprint, assert: assertFingerprint },
  alternative: { validate: validateAlternative, assert: assertAlternative },
  finding: { validate: validateFinding, assert: assertFinding },
  scanResult: { validate: validateScanResult, assert: assertScanResult },
  report: { validate: validateReport, assert: assertReport }
};
