import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createVendorMatcher } from "@scaneur/rules";
import { parseEvidenceCandidates } from "./parsers/index.js";

export { parseContent, parseEvidenceCandidates } from "./parsers/index.js";

export const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const DEFAULT_IGNORED_DIRECTORIES = Object.freeze([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "target",
  "vendor"
]);

export const APPROVED_ENV_TEMPLATES = Object.freeze([
  ".env.example",
  ".env.sample",
  ".env.template"
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".key",
  ".pem",
  ".p12",
  ".pfx",
  ".crt",
  ".cer"
]);

const SENSITIVE_FILE_NAMES = new Set([
  ".npmrc",
  ".pypirc",
  ".netrc",
  "credentials",
  "credentials.json",
  "credentials.yml",
  "credentials.yaml",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "private.key",
  "service-account.json",
  "service_account.json",
  "secrets.json",
  "secrets.yml",
  "secrets.yaml"
]);

const PACKAGE_MANIFESTS = new Map([
  ["package.json", "package_json"],
  ["pyproject.toml", "pyproject_toml"],
  ["requirements.txt", "python_requirements"],
  ["pipfile", "pipfile"],
  ["go.mod", "go_mod"],
  ["cargo.toml", "cargo_toml"],
  ["composer.json", "composer_json"],
  ["gemfile", "gemfile"],
  ["build.gradle", "gradle"],
  ["build.gradle.kts", "gradle"],
  ["pom.xml", "maven_pom"]
]);

const LOCKFILES = new Map([
  ["package-lock.json", "package_lock"],
  ["npm-shrinkwrap.json", "package_lock"],
  ["yarn.lock", "yarn_lock"],
  ["pnpm-lock.yaml", "pnpm_lock"],
  ["bun.lock", "bun_lock"],
  ["bun.lockb", "bun_lock"],
  ["poetry.lock", "poetry_lock"],
  ["pipfile.lock", "pipfile_lock"],
  ["go.sum", "go_sum"],
  ["cargo.lock", "cargo_lock"],
  ["composer.lock", "composer_lock"],
  ["gemfile.lock", "gemfile_lock"]
]);

const CONFIG_FILES = new Map([
  ["vercel.json", "config_file"],
  ["netlify.toml", "config_file"],
  ["render.yaml", "config_file"],
  ["render.yml", "config_file"],
  ["railway.json", "config_file"],
  ["fly.toml", "config_file"],
  ["firebase.json", "config_file"],
  ["wrangler.toml", "config_file"],
  ["wrangler.json", "config_file"],
  ["wrangler.jsonc", "config_file"],
  ["sentry.properties", "config_file"],
  ["dependabot.yml", "config_file"],
  ["dependabot.yaml", "config_file"],
  ["renovate.json", "config_file"]
]);

const DOCKER_COMPOSE_FILES = new Set([
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml"
]);

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function relativePath(rootPath, absolutePath) {
  const relative = path.relative(rootPath, absolutePath);
  return relative === "" ? path.basename(absolutePath) : toPosixPath(relative);
}

function lowerBasename(filePath) {
  return path.basename(filePath).toLowerCase();
}

function isApprovedEnvTemplate(basename) {
  return APPROVED_ENV_TEMPLATES.includes(basename.toLowerCase());
}

function isAppleDoubleSidecar(basename) {
  return basename.startsWith("._");
}

export function isSensitiveFile(filePath) {
  const basename = lowerBasename(filePath);

  if (isApprovedEnvTemplate(basename)) {
    return false;
  }

  if (basename === ".env" || basename.startsWith(".env.")) {
    return true;
  }

  if (SENSITIVE_EXTENSIONS.has(path.extname(basename))) {
    return true;
  }

  if (SENSITIVE_FILE_NAMES.has(basename)) {
    return true;
  }

  return /(^|[^a-z0-9])(secret|secrets|token|tokens|credential|credentials|api[-_]?key|private[-_]?key|key)([^a-z0-9]|$)/i.test(
    basename
  );
}

function isWorkflowFile(relativeFilePath, basename) {
  return (
    relativeFilePath.startsWith(".github/workflows/") &&
    (basename.endsWith(".yml") || basename.endsWith(".yaml"))
  );
}

function classifySupportedFile(relativeFilePath) {
  const basenameOriginal = path.posix.basename(relativeFilePath);
  const basename = basenameOriginal.toLowerCase();

  if (isApprovedEnvTemplate(basename)) {
    return {
      file_type: "env_template",
      parser: "env_template"
    };
  }

  if (isWorkflowFile(relativeFilePath, basename)) {
    return {
      file_type: "workflow",
      parser: "github_actions"
    };
  }

  if (basenameOriginal === "Dockerfile" || basenameOriginal.startsWith("Dockerfile.")) {
    return {
      file_type: "dockerfile",
      parser: "dockerfile"
    };
  }

  if (DOCKER_COMPOSE_FILES.has(basename)) {
    return {
      file_type: "dockerfile",
      parser: "docker_compose"
    };
  }

  if (basename.startsWith("requirements") && basename.endsWith(".txt")) {
    return {
      file_type: "package_manifest",
      parser: "python_requirements"
    };
  }

  if (PACKAGE_MANIFESTS.has(basename)) {
    return {
      file_type: "package_manifest",
      parser: PACKAGE_MANIFESTS.get(basename)
    };
  }

  if (LOCKFILES.has(basename)) {
    return {
      file_type: "lockfile",
      parser: LOCKFILES.get(basename)
    };
  }

  if (CONFIG_FILES.has(basename)) {
    return {
      file_type: "config_file",
      parser: CONFIG_FILES.get(basename)
    };
  }

  if (basename === ".terraform.lock.hcl" || basename.endsWith(".tf")) {
    return {
      file_type: "terraform",
      parser: "terraform"
    };
  }

  return null;
}

function skipped(pathValue, reason, configuredByUser = false) {
  return {
    path: pathValue,
    reason,
    configured_by_user: configuredByUser
  };
}

function scanned(pathValue, classification) {
  return {
    path: pathValue,
    file_type: classification.file_type,
    parser: classification.parser,
    status: "scanned"
  };
}

function createIgnoredDirectorySet(options) {
  const ignored = new Set(options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES);
  for (const directoryName of options.includeDirectories ?? []) {
    ignored.delete(directoryName);
  }
  return ignored;
}

async function discoverAt(rootPath, currentPath, context) {
  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    context.filesSkipped.push(skipped(relativePath(rootPath, currentPath), "unreadable"));
    return;
  }

  entries.sort((left, right) => compareStrings(left.name, right.name));

  for (const entry of entries) {
    const absoluteEntryPath = path.join(currentPath, entry.name);
    const relativeEntryPath = relativePath(rootPath, absoluteEntryPath);

    if (isAppleDoubleSidecar(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (context.ignoredDirectories.has(entry.name)) {
        context.filesSkipped.push(skipped(relativeEntryPath, "ignored_directory"));
        continue;
      }

      await discoverAt(rootPath, absoluteEntryPath, context);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (isSensitiveFile(entry.name)) {
      context.filesSkipped.push(skipped(relativeEntryPath, "sensitive_file_default_skip"));
      continue;
    }

    const classification = classifySupportedFile(relativeEntryPath);
    if (!classification) {
      context.filesSkipped.push(skipped(relativeEntryPath, "unsupported_file_type"));
      continue;
    }

    let fileStat;
    try {
      fileStat = await stat(absoluteEntryPath);
    } catch {
      context.filesSkipped.push(skipped(relativeEntryPath, "unreadable"));
      continue;
    }

    if (fileStat.size > context.maxFileBytes) {
      context.filesSkipped.push(skipped(relativeEntryPath, "file_too_large"));
      continue;
    }

    context.filesScanned.push(scanned(relativeEntryPath, classification));
  }
}

export async function discoverFiles(targetPath, options = {}) {
  const rootPath = path.resolve(targetPath);
  const context = {
    filesScanned: [],
    filesSkipped: [],
    ignoredDirectories: createIgnoredDirectorySet(options),
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  };

  await discoverAt(rootPath, rootPath, context);

  context.filesScanned.sort((left, right) => compareStrings(left.path, right.path));
  context.filesSkipped.sort((left, right) => compareStrings(left.path, right.path));

  return {
    target_path: rootPath,
    files_scanned: context.filesScanned,
    files_skipped: context.filesSkipped
  };
}

export const discoverSupportedFiles = discoverFiles;

export async function parseDiscoveredFile(targetPath, scannedFile) {
  const rootPath = path.resolve(targetPath);
  const absolutePath = path.resolve(rootPath, scannedFile.path);
  const relativeToRoot = path.relative(rootPath, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Refusing to parse a file outside the scan target.");
  }

  const content = await readFile(absolutePath, "utf8");

  return parseEvidenceCandidates({
    source_file: scannedFile.path,
    source_type: scannedFile.file_type,
    parser: scannedFile.parser,
    content
  });
}

const CONFIDENCE_RANK = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3
};

const VALID_CONFIDENCE = new Set(Object.keys(CONFIDENCE_RANK));

function confidence(value, fallback = "unknown") {
  return VALID_CONFIDENCE.has(value) ? value : fallback;
}

function higherConfidence(left, right) {
  return CONFIDENCE_RANK[confidence(left)] >= CONFIDENCE_RANK[confidence(right)] ? confidence(left) : confidence(right);
}

function lowerConfidence(left, right) {
  return CONFIDENCE_RANK[confidence(left)] <= CONFIDENCE_RANK[confidence(right)] ? confidence(left) : confidence(right);
}

function stableHash(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== ""))];
}

function evidenceNoun(evidenceType) {
  return {
    package_name: "package",
    env_var: "environment variable",
    domain: "domain",
    docker_image: "Docker image",
    github_action: "GitHub Action",
    config_file: "config file",
    terraform_provider: "Terraform provider",
    text_pattern: "text pattern"
  }[evidenceType] ?? "evidence";
}

function defaultObservedFact(candidate, match) {
  if (match.kind === "fingerprint" && match.fingerprint.result.observed_fact) {
    return match.fingerprint.result.observed_fact;
  }
  return `The ${evidenceNoun(candidate.evidence_type)} \`${candidate.normalized_value}\` was found in \`${candidate.source_file}\`.`;
}

function defaultInference(match) {
  if (match.kind === "fingerprint" && match.fingerprint.result.inference) {
    return match.fingerprint.result.inference;
  }
  const vendorName = match.vendor?.name ?? match.fingerprint?.result.vendor_id ?? "the matched service";
  return `The project may integrate with ${vendorName}.`;
}

function matchVendorId(match) {
  if (match.kind === "vendor") return match.vendor.id;
  return match.vendor?.id ?? match.fingerprint.result.vendor_id;
}

function matchVendorName(match) {
  if (match.vendor) return match.vendor.name;
  if (match.kind === "fingerprint" && match.fingerprint.result.vendor_id) return match.fingerprint.result.vendor_id;
  return match.fingerprint.result.evidence_label;
}

function matchCategory(match) {
  if (match.kind === "vendor") return match.vendor.category;
  if (match.kind === "fingerprint") return match.fingerprint.result.candidate_category ?? match.vendor?.category ?? "unknown";
  return "unknown";
}

function matchVerificationStatus(match) {
  if (match.kind === "vendor") return match.vendor.verification.status;
  return match.fingerprint.verification_status;
}

function defaultScores(match, evidenceConfidence) {
  if (match.kind === "vendor") {
    return {
      ...match.vendor.scoring_defaults,
      evidence_confidence: evidenceConfidence
    };
  }
  return {
    jurisdiction_signal: "unknown",
    data_sensitivity_signal: "unknown",
    operational_criticality: "unknown",
    migration_effort: "unknown",
    alternative_maturity: "unknown",
    evidence_confidence: evidenceConfidence
  };
}

function defaultRecommendations(match) {
  if (match.kind === "vendor") return match.vendor.recommendation_defaults.categories;
  return ["manual_review_required"];
}

function defaultLimitations(match) {
  if (match.kind === "vendor") return match.vendor.limitations;
  return unique([...(match.vendor?.limitations ?? []), ...match.fingerprint.limitations]);
}

function findingKey(match) {
  const vendorId = matchVendorId(match);
  if (vendorId) return `vendor:${vendorId}`;
  return `fingerprint:${match.fingerprint.id}`;
}

function findingType(match) {
  return match.kind === "vendor" ? "known_vendor" : "fingerprint_only";
}

function makeEvidenceItem(candidate, match) {
  const itemConfidence =
    match.kind === "fingerprint"
      ? lowerConfidence(
          confidence(candidate.confidence_hint, match.fingerprint.result.confidence),
          match.fingerprint.result.confidence
        )
      : confidence(candidate.confidence_hint, match.vendor?.scoring_defaults.evidence_confidence);
  const observedFact = defaultObservedFact(candidate, match);
  const inference = defaultInference(match);
  const evidenceKey = [
    candidate.source_file,
    candidate.source_type,
    candidate.evidence_type,
    candidate.normalized_value,
    match.ruleId,
    candidate.line_number ?? "",
    itemConfidence,
    candidate.redacted ? "redacted" : "plain"
  ].join("\u0000");

  return {
    dedupeKey: evidenceKey,
    item: {
      evidence_id: `evidence:${stableHash(evidenceKey)}`,
      source_file: candidate.source_file,
      source_type: candidate.source_type,
      evidence_type: candidate.evidence_type,
      matched_value: candidate.normalized_value,
      matched_rule_id: match.ruleId,
      confidence: itemConfidence,
      observed_fact: observedFact,
      inference,
      line_number: candidate.line_number ?? null,
      redacted: candidate.redacted === true
    }
  };
}

function createFindingBucket(match) {
  const vendorId = matchVendorId(match);
  const initialEvidenceConfidence =
    match.kind === "fingerprint" ? match.fingerprint.result.confidence : match.vendor?.scoring_defaults.evidence_confidence;

  return {
    finding_id: findingKey(match),
    finding_type: findingType(match),
    vendor_id: vendorId ?? null,
    vendor_name: matchVendorName(match),
    category: matchCategory(match),
    verification_status: matchVerificationStatus(match),
    scores: defaultScores(match, confidence(initialEvidenceConfidence)),
    recommendations: defaultRecommendations(match),
    observed_facts: [],
    inferences: [],
    unknowns: ["Production usage was not verified by the scanner."],
    manual_review_recommended:
      match.kind === "fingerprint" ? match.fingerprint.result.manual_review_recommended ?? true : true,
    evidence: [],
    alternatives: [],
    limitations: defaultLimitations(match),
    _evidenceKeys: new Set()
  };
}

function promoteBucketToKnownVendor(bucket, match) {
  if (match.kind !== "vendor" || bucket.finding_type === "known_vendor") return bucket;

  const evidenceConfidence = bucket.scores.evidence_confidence;
  bucket.finding_type = "known_vendor";
  bucket.vendor_id = match.vendor.id;
  bucket.vendor_name = match.vendor.name;
  bucket.category = match.vendor.category;
  bucket.verification_status = match.vendor.verification.status;
  bucket.scores = {
    ...match.vendor.scoring_defaults,
    evidence_confidence: evidenceConfidence
  };
  bucket.recommendations = unique([...bucket.recommendations, ...defaultRecommendations(match)]);
  bucket.limitations = unique([...bucket.limitations, ...defaultLimitations(match)]);
  bucket.manual_review_recommended = true;

  return bucket;
}

function finalizeFinding(bucket) {
  const { _evidenceKeys, ...finding } = bucket;
  finding.observed_facts = unique(finding.evidence.map((item) => item.observed_fact));
  finding.inferences = unique(finding.evidence.map((item) => item.inference));
  finding.recommendations = unique(finding.recommendations);
  finding.limitations = unique(finding.limitations);
  return finding;
}

function compareFindings(left, right) {
  return left.finding_id.localeCompare(right.finding_id);
}

const UNSUPPORTED_UNKNOWN_CLAIMS = Object.freeze([
  "vendor identity",
  "jurisdiction",
  "ownership/control",
  "data processing role"
]);

const UNKNOWN_REVIEW_STEPS = Object.freeze([
  "Identify the service owner.",
  "Confirm whether the endpoint or integration is used in production.",
  "Check whether personal data is sent.",
  "Add a vendor profile or fingerprint if relevant."
]);

const COMMON_ENV_PREFIXES = new Set([
  "APP",
  "CI",
  "DEBUG",
  "DEV",
  "DOCKER",
  "HOST",
  "HTTP",
  "HTTPS",
  "LOCAL",
  "LOG",
  "NODE",
  "NPM",
  "PATH",
  "PORT",
  "PUBLIC",
  "PWD",
  "SERVER",
  "SERVICE",
  "SHELL",
  "TEST",
  "TMP",
  "URL",
  "USER",
  "VITE",
  "WEB"
]);

const COMMON_ENV_PREFIX_CHAINS = new Set([
  "NEXT_PUBLIC",
  "NUXT_PUBLIC",
  "PUBLIC",
  "REACT_APP",
  "VITE"
]);

const SECRET_LIKE_ENV_PARTS = new Set([
  "API",
  "API_KEY",
  "CLIENT",
  "CLIENT_ID",
  "DSN",
  "ENDPOINT",
  "PROJECT_ID",
  "SECRET",
  "TOKEN",
  "URL",
  "WEBHOOK"
]);

const COMMON_PUBLIC_DOMAINS = new Set([
  "api.github.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "docker.io",
  "docs.github.com",
  "example.com",
  "example.net",
  "example.org",
  "files.pythonhosted.org",
  "ghcr.io",
  "github.com",
  "gitlab.com",
  "golang.org",
  "gopkg.in",
  "npmjs.com",
  "pkg.go.dev",
  "proxy.golang.org",
  "pypi.org",
  "registry-1.docker.io",
  "registry.npmjs.org",
  "repo.maven.apache.org",
  "rubygems.org",
  "schema.org",
  "schemas.android.com",
  "www.w3.org"
]);

const COMMON_PUBLIC_DOMAIN_SUFFIXES = [
  ".githubusercontent.com",
  ".npmjs.org",
  ".pythonhosted.org"
];

const DOMAIN_SIGNAL_LABELS = [
  "api",
  "auth",
  "cdn",
  "collector",
  "events",
  "hooks",
  "ingest",
  "login",
  "payments",
  "telemetry",
  "track",
  "webhook"
];

const GENERIC_DOCKER_IMAGE_NAMES = new Set([
  "alpine",
  "busybox",
  "debian",
  "golang",
  "httpd",
  "mysql",
  "nginx",
  "node",
  "postgres",
  "python",
  "redis",
  "ruby",
  "ubuntu"
]);

const COMMON_DOCKER_OWNERS = new Set([
  "library",
  "docker",
  "docker.io/library",
  "ghcr.io/actions",
  "ghcr.io/github"
]);

const GENERIC_GITHUB_ACTION_OWNERS = new Set([
  "actions",
  "github",
  "docker",
  "pnpm",
  "yarnpkg"
]);

const ACTION_SIGNAL_WORDS = [
  "analytics",
  "auth",
  "cloud",
  "deploy",
  "notify",
  "pages",
  "payment",
  "scan",
  "secret",
  "security",
  "slack",
  "sms",
  "upload"
];

function normalizeUnknownValue(value) {
  return String(value ?? "").trim();
}

function unknownCandidateType(candidate) {
  if (candidate.evidence_type === "domain") return "external_domain";
  if (candidate.evidence_type === "env_var") return "env_prefix";
  if (candidate.evidence_type === "docker_image") return "docker_image";
  if (candidate.evidence_type === "github_action") return "github_action";
  if (candidate.evidence_type === "package_name") return "package";
  if (candidate.evidence_type === "config_file" || candidate.evidence_type === "text_pattern") return "config_reference";
  return null;
}

function candidateConfidence(candidate, fallback = "medium") {
  const value = confidence(candidate.confidence_hint, fallback);
  return value === "high" ? "medium" : value;
}

function domainLabels(domain) {
  return String(domain).split(".").filter(Boolean);
}

function isCommonPublicDomain(domain) {
  return (
    COMMON_PUBLIC_DOMAINS.has(domain) ||
    COMMON_PUBLIC_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix))
  );
}

function isUnknownDomainCandidate(candidate) {
  const domain = normalizeUnknownValue(candidate.normalized_value).toLowerCase();
  if (!domain || isCommonPublicDomain(domain)) return false;
  if (candidate.source_type === "package_manifest" || candidate.source_type === "lockfile") return false;

  const labels = domainLabels(domain);
  if (labels.some((label) => DOMAIN_SIGNAL_LABELS.includes(label))) return true;
  if (candidate.source_type === "config_file" || candidate.source_type === "workflow") return true;

  return false;
}

function envPrefix(value) {
  const normalized = normalizeUnknownValue(value).toUpperCase();
  const parts = normalized.split("_").filter(Boolean);
  if (parts.length < 2) return null;

  const firstTwo = parts.slice(0, 2).join("_");
  if (COMMON_ENV_PREFIX_CHAINS.has(firstTwo)) return null;
  if (COMMON_ENV_PREFIX_CHAINS.has(parts[0]) || COMMON_ENV_PREFIXES.has(parts[0])) return null;
  if (!/^[A-Z][A-Z0-9]{1,31}$/.test(parts[0])) return null;

  return parts[0];
}

function envHasServiceSignal(value) {
  const normalized = normalizeUnknownValue(value).toUpperCase();
  const parts = normalized.split("_").filter(Boolean);
  const partPairs = parts.slice(0, -1).map((part, index) => `${part}_${parts[index + 1]}`);
  return [...parts, ...partPairs].some((part) => SECRET_LIKE_ENV_PARTS.has(part));
}

function dockerOwner(value) {
  const normalized = normalizeUnknownValue(value).toLowerCase().split("@")[0];
  if (!normalized) return null;

  const parts = normalized.split("/").filter(Boolean);
  const imageName = parts.at(-1)?.split(":")[0] ?? "";
  if (parts.length === 1) return GENERIC_DOCKER_IMAGE_NAMES.has(imageName) ? null : imageName;

  const owner = parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts[0];
  if (COMMON_DOCKER_OWNERS.has(owner) || COMMON_DOCKER_OWNERS.has(`${parts[0]}/${owner}`)) return null;
  if (GENERIC_DOCKER_IMAGE_NAMES.has(imageName) && (owner === "library" || owner === "docker.io/library")) return null;
  return owner;
}

function githubActionOwner(value) {
  const repository = normalizeUnknownValue(value).toLowerCase().split("@")[0];
  const parts = repository.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  if (GENERIC_GITHUB_ACTION_OWNERS.has(parts[0])) return null;
  return parts[0];
}

function githubActionHasSignal(value) {
  const repository = normalizeUnknownValue(value).toLowerCase().split("@")[0];
  return ACTION_SIGNAL_WORDS.some((word) => repository.includes(word));
}

function emptyUnknownBucket(candidateType, normalizedValue, reasonFlagged, evidenceConfidence) {
  return {
    candidate_id: `unknown:${candidateType}:${normalizedValue}`,
    candidate_type: candidateType,
    normalized_value: normalizedValue,
    source_files: [],
    reason_flagged: reasonFlagged,
    evidence_confidence: evidenceConfidence,
    manual_review_recommended: true,
    unsupported_claims: [...UNSUPPORTED_UNKNOWN_CLAIMS],
    suggested_review_steps: [...UNKNOWN_REVIEW_STEPS],
    _sourceFiles: new Set()
  };
}

function unknownDescriptor(candidate, envPrefixCounts) {
  const candidateType = unknownCandidateType(candidate);
  if (!candidateType) return null;

  if (candidateType === "external_domain") {
    if (!isUnknownDomainCandidate(candidate)) return null;
    return {
      candidateType,
      normalizedValue: normalizeUnknownValue(candidate.normalized_value).toLowerCase(),
      reasonFlagged: "External-looking domain did not match a known vendor profile or fingerprint.",
      evidenceConfidence: candidateConfidence(candidate, "medium")
    };
  }

  if (candidateType === "env_prefix") {
    const prefix = envPrefix(candidate.normalized_value);
    if (!prefix || !envHasServiceSignal(candidate.normalized_value) || (envPrefixCounts.get(prefix) ?? 0) < 2) {
      return null;
    }
    return {
      candidateType,
      normalizedValue: prefix,
      reasonFlagged: "Multiple unknown environment variable keys share this service-looking prefix.",
      evidenceConfidence: "medium"
    };
  }

  if (candidateType === "docker_image") {
    const owner = dockerOwner(candidate.normalized_value);
    if (!owner) return null;
    return {
      candidateType,
      normalizedValue: owner,
      reasonFlagged: "Docker image owner or registry namespace did not match a known vendor profile or fingerprint.",
      evidenceConfidence: candidateConfidence(candidate, "medium")
    };
  }

  if (candidateType === "github_action") {
    const owner = githubActionOwner(candidate.normalized_value);
    if (!owner || !githubActionHasSignal(candidate.normalized_value)) return null;
    return {
      candidateType,
      normalizedValue: owner,
      reasonFlagged: "GitHub Action owner did not match a known vendor profile or fingerprint and the action name has an external-service signal.",
      evidenceConfidence: candidateConfidence(candidate, "medium")
    };
  }

  return null;
}

function finalizeUnknownCandidate(bucket) {
  const { _sourceFiles, ...candidate } = bucket;
  candidate.source_files = [..._sourceFiles].sort(compareStrings);
  return candidate;
}

function compareUnknownCandidates(left, right) {
  return left.candidate_id.localeCompare(right.candidate_id);
}

export function detectUnknownCandidates(evidenceCandidates, options) {
  const matcher = typeof options?.matchCandidate === "function" ? options : createVendorMatcher(options);
  const unmatched = [];
  const envPrefixCounts = new Map();

  for (const candidate of evidenceCandidates) {
    if (matcher.matchCandidate(candidate).length > 0) continue;
    unmatched.push(candidate);

    if (candidate.evidence_type === "env_var" && envHasServiceSignal(candidate.normalized_value)) {
      const prefix = envPrefix(candidate.normalized_value);
      if (prefix) envPrefixCounts.set(prefix, (envPrefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  const buckets = new Map();
  for (const candidate of unmatched) {
    const descriptor = unknownDescriptor(candidate, envPrefixCounts);
    if (!descriptor) continue;

    const key = `unknown:${descriptor.candidateType}:${descriptor.normalizedValue}`;
    const bucket =
      buckets.get(key) ??
      emptyUnknownBucket(
        descriptor.candidateType,
        descriptor.normalizedValue,
        descriptor.reasonFlagged,
        descriptor.evidenceConfidence
      );

    bucket._sourceFiles.add(candidate.source_file);
    bucket.evidence_confidence = higherConfidence(bucket.evidence_confidence, descriptor.evidenceConfidence);
    buckets.set(key, bucket);
  }

  return [...buckets.values()].map(finalizeUnknownCandidate).sort(compareUnknownCandidates);
}

export function matchEvidenceCandidatesWithUnknowns(evidenceCandidates, options) {
  return {
    findings: matchEvidenceCandidates(evidenceCandidates, options),
    unknown_candidates: detectUnknownCandidates(evidenceCandidates, options)
  };
}

export function matchEvidenceCandidates(evidenceCandidates, options) {
  const matcher = typeof options?.matchCandidate === "function" ? options : createVendorMatcher(options);
  const buckets = new Map();

  for (const candidate of evidenceCandidates) {
    for (const match of matcher.matchCandidate(candidate)) {
      const key = findingKey(match);
      const bucket = promoteBucketToKnownVendor(buckets.get(key) ?? createFindingBucket(match), match);
      const evidence = makeEvidenceItem(candidate, match);

      if (!bucket._evidenceKeys.has(evidence.dedupeKey)) {
        bucket._evidenceKeys.add(evidence.dedupeKey);
        bucket.evidence.push(evidence.item);
        bucket.scores.evidence_confidence = higherConfidence(bucket.scores.evidence_confidence, evidence.item.confidence);
      }

      buckets.set(key, bucket);
    }
  }

  return [...buckets.values()].map(finalizeFinding).sort(compareFindings);
}
