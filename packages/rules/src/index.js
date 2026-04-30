import {
  validateAlternative,
  validateFingerprint,
  validateVendorProfile
} from "@scaneur/types";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

function issue(path, message) {
  return { path, message };
}

function ok(input, errors) {
  return errors.length === 0
    ? { success: true, data: input, errors: [] }
    : { success: false, errors };
}

function formatNestedError(prefix, error) {
  return issue(`${prefix}${error.path ? `.${error.path}` : ""}`, error.message);
}

function validateCollection(input, path, itemKey, validator) {
  const errors = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return ok(input, [issue(path || "<root>", "expected object")]);
  }

  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== itemKey) {
    errors.push(issue(path || "<root>", `expected only field "${itemKey}"`));
  }

  const items = input[itemKey];
  if (!Array.isArray(items)) {
    errors.push(issue(itemKey, "expected array"));
    return ok(input, errors);
  }

  const seenIds = new Map();
  items.forEach((item, index) => {
    const prefix = `${itemKey}[${index}]`;
    const result = validator(item);
    if (!result.success) {
      errors.push(...result.errors.map((error) => formatNestedError(prefix, error)));
      return;
    }

    const previousIndex = seenIds.get(item.id);
    if (previousIndex !== undefined) {
      errors.push(issue(`${prefix}.id`, `duplicate id also used at ${itemKey}[${previousIndex}].id`));
    } else {
      seenIds.set(item.id, index);
    }
  });

  return ok(input, errors);
}

export function validateVendorDatabase(input) {
  return validateCollection(input, "", "vendors", validateVendorProfile);
}

export function validateFingerprintDatabase(input) {
  return validateCollection(input, "", "fingerprints", validateFingerprint);
}

export function validateAlternativesDatabase(input) {
  return validateCollection(input, "", "alternatives", validateAlternative);
}

export function formatRuleValidationErrors(errors) {
  return errors.map((error) => `${error.path}: ${error.message}`).join("\n");
}

function assertWith(validator, input, label) {
  const result = validator(input);
  if (!result.success) {
    throw new Error(`${label} validation failed:\n${formatRuleValidationErrors(result.errors)}`);
  }
  return input;
}

export const assertVendorDatabase = (input) => assertWith(validateVendorDatabase, input, "Vendor database");
export const assertFingerprintDatabase = (input) =>
  assertWith(validateFingerprintDatabase, input, "Fingerprint database");
export const assertAlternativesDatabase = (input) =>
  assertWith(validateAlternativesDatabase, input, "Alternatives database");

function stripYamlComment(line) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "#") {
      return line.slice(0, index);
    }
  }

  return line;
}

function splitInlineList(value) {
  const items = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of value) {
    if (quote) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ",") {
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) items.push(current.trim());
  return items;
}

function parseYamlScalar(rawValue) {
  const value = rawValue.trim();
  if (value === "[]") return [];
  if (value === "{}") return {};
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitInlineList(inner).map(parseYamlScalar) : [];
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return JSON.parse(value);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function yamlLines(content) {
  return content
    .split(/\r\n|\r|\n/)
    .map((line) => stripYamlComment(line))
    .filter((line) => line.trim() !== "")
    .map((line) => ({
      indent: line.match(/^ */)[0].length,
      text: line.trim()
    }));
}

function splitYamlPair(text) {
  const colonIndex = text.indexOf(":");
  if (colonIndex === -1) return null;
  return {
    key: text.slice(0, colonIndex).trim(),
    value: text.slice(colonIndex + 1).trim()
  };
}

function parseYamlBlock(lines, startIndex, indent) {
  if (startIndex >= lines.length || lines[startIndex].indent < indent) {
    return { value: null, nextIndex: startIndex };
  }

  if (lines[startIndex].text.startsWith("- ")) {
    return parseYamlSequence(lines, startIndex, indent);
  }

  return parseYamlMapping(lines, startIndex, indent);
}

function parseYamlSequence(lines, startIndex, indent) {
  const value = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      index += 1;
      continue;
    }
    if (!line.text.startsWith("- ")) break;

    const itemText = line.text.slice(2).trim();
    if (!itemText) {
      const child = parseYamlBlock(lines, index + 1, indent + 2);
      value.push(child.value);
      index = child.nextIndex;
      continue;
    }

    const pair = splitYamlPair(itemText);
    if (pair?.key) {
      const item = {
        [pair.key]: pair.value ? parseYamlScalar(pair.value) : null
      };
      const child = parseYamlBlock(lines, index + 1, indent + 2);
      if (child.value && typeof child.value === "object" && !Array.isArray(child.value)) {
        Object.assign(item, child.value);
        index = child.nextIndex;
      } else {
        index += 1;
      }
      value.push(item);
      continue;
    }

    value.push(parseYamlScalar(itemText));
    index += 1;
  }

  return { value, nextIndex: index };
}

function parseYamlMapping(lines, startIndex, indent) {
  const value = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      index += 1;
      continue;
    }
    if (line.text.startsWith("- ")) break;

    const pair = splitYamlPair(line.text);
    if (!pair?.key) {
      throw new Error(`Invalid YAML mapping line: ${line.text}`);
    }

    if (pair.value) {
      value[pair.key] = parseYamlScalar(pair.value);
      index += 1;
      continue;
    }

    const child = parseYamlBlock(lines, index + 1, indent + 2);
    value[pair.key] = child.value;
    index = child.nextIndex;
  }

  return { value, nextIndex: index };
}

function parseYamlSubset(content) {
  const lines = yamlLines(content);
  if (lines.length === 0) return {};
  return parseYamlBlock(lines, 0, lines[0].indent).value;
}

function parseDatabaseFile(content, filePath) {
  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  }
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return parseYamlSubset(content);
  }
  throw new Error(`Unsupported database file type: ${filePath}`);
}

function shouldReadDatabaseFile(fileName) {
  if (fileName.startsWith("._") || fileName === ".gitkeep") return false;
  return fileName.endsWith(".json") || fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

async function collectDatabaseFiles(rootPath) {
  const files = [];

  async function visit(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith("._")) await visit(entryPath);
        continue;
      }
      if (entry.isFile() && shouldReadDatabaseFile(entry.name)) {
        files.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return files;
}

async function resolveDatabaseDirectory(rootPath, directoryName) {
  const direct = path.resolve(rootPath);
  const directStat = await stat(direct).catch(() => null);
  if (directStat?.isDirectory() && path.basename(direct) === directoryName) return direct;

  const nested = path.join(direct, directoryName);
  const nestedStat = await stat(nested).catch(() => null);
  if (nestedStat?.isDirectory()) return nested;

  return direct;
}

async function loadCollectionDatabase(rootPath, directoryName, itemKey, assertDatabase) {
  const databasePath = await resolveDatabaseDirectory(rootPath, directoryName);
  const items = [];

  for (const filePath of await collectDatabaseFiles(databasePath)) {
    const parsed = parseDatabaseFile(await readFile(filePath, "utf8"), filePath);
    if (Array.isArray(parsed?.[itemKey])) {
      items.push(...parsed[itemKey]);
    } else if (parsed && typeof parsed === "object" && typeof parsed.id === "string") {
      items.push(parsed);
    } else if (parsed && Object.keys(parsed).length > 0) {
      throw new Error(`Unsupported ${itemKey} database shape in ${filePath}`);
    }
  }

  return assertDatabase({ [itemKey]: items });
}

export async function loadVendorDatabase(rootPath = process.cwd()) {
  return loadCollectionDatabase(rootPath, "vendors", "vendors", assertVendorDatabase);
}

export async function loadFingerprintDatabase(rootPath = process.cwd()) {
  return loadCollectionDatabase(rootPath, "fingerprints", "fingerprints", assertFingerprintDatabase);
}

function normalizeLower(value) {
  return String(value).trim().toLowerCase();
}

function normalizePackageName(value, ecosystem = "unknown") {
  const lower = normalizeLower(value);
  return ecosystem === "pypi" ? lower.replace(/[_.]+/g, "-") : lower;
}

function normalizeDomain(value) {
  return normalizeLower(value).replace(/^\*\./, "").replace(/[).,\];:]+$/g, "");
}

function normalizeAction(value) {
  return normalizeLower(value);
}

function actionRepository(value) {
  return normalizeAction(value).split("@")[0];
}

function normalizeDockerImage(value) {
  const image = normalizeLower(value).split("@")[0];
  const slashParts = image.split("/");
  const last = slashParts[slashParts.length - 1];
  const taglessLast = last.includes(":") ? last.slice(0, last.lastIndexOf(":")) : last;
  return [...slashParts.slice(0, -1), taglessLast].join("/");
}

function dockerImageWithoutRegistry(value) {
  const normalized = normalizeDockerImage(value);
  const parts = normalized.split("/");
  if (parts.length > 1 && (parts[0].includes(".") || parts[0].includes(":"))) {
    return parts.slice(1).join("/");
  }
  return normalized;
}

function addIndexValue(map, key, match) {
  if (!key) return;
  const matches = map.get(key) ?? [];
  matches.push(match);
  map.set(key, matches);
}

function wildcardPattern(value) {
  const escaped = normalizeDockerImage(value).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
  return new RegExp(`^${escaped}$`);
}

export function buildVendorLookupIndexes(vendorDatabase) {
  const database = assertVendorDatabase(vendorDatabase);
  const indexes = {
    vendorsById: new Map(),
    packages: new Map(),
    packageNames: new Map(),
    domains: new Map(),
    envPatterns: [],
    dockerImages: new Map(),
    dockerImagePatterns: [],
    githubActions: new Map(),
    githubActionRepositories: new Map(),
    configFiles: new Map(),
    terraformProviders: new Map()
  };

  for (const vendor of database.vendors) {
    indexes.vendorsById.set(vendor.id, vendor);

    for (const [ecosystem, packageNames] of Object.entries(vendor.identifiers.packages)) {
      for (const packageName of packageNames) {
        const match = { kind: "vendor", vendor, ruleId: `vendor:${vendor.id}:package:${ecosystem}:${packageName}` };
        addIndexValue(indexes.packages, `${ecosystem}:${normalizePackageName(packageName, ecosystem)}`, match);
        addIndexValue(indexes.packageNames, normalizePackageName(packageName, ecosystem), match);
      }
    }

    for (const domain of vendor.identifiers.domains) {
      addIndexValue(indexes.domains, normalizeDomain(domain), {
        kind: "vendor",
        vendor,
        ruleId: `vendor:${vendor.id}:domain:${domain}`
      });
    }

    for (const pattern of vendor.identifiers.env_patterns) {
      indexes.envPatterns.push({
        kind: "vendor",
        vendor,
        ruleId: `vendor:${vendor.id}:env:${pattern}`,
        pattern: new RegExp(pattern, "i")
      });
    }

    for (const image of vendor.identifiers.docker_images) {
      const match = { kind: "vendor", vendor, ruleId: `vendor:${vendor.id}:docker:${image}` };
      if (image.includes("*")) {
        indexes.dockerImagePatterns.push({
          ...match,
          pattern: wildcardPattern(image),
          patternWithoutRegistry: wildcardPattern(dockerImageWithoutRegistry(image))
        });
      } else {
        addIndexValue(indexes.dockerImages, normalizeDockerImage(image), match);
        addIndexValue(indexes.dockerImages, dockerImageWithoutRegistry(image), match);
      }
    }

    for (const action of vendor.identifiers.github_actions) {
      const match = { kind: "vendor", vendor, ruleId: `vendor:${vendor.id}:github_action:${action}` };
      addIndexValue(indexes.githubActions, normalizeAction(action), match);
      addIndexValue(indexes.githubActionRepositories, actionRepository(action), match);
    }

    for (const configFile of vendor.identifiers.config_files) {
      addIndexValue(indexes.configFiles, normalizeLower(configFile), {
        kind: "vendor",
        vendor,
        ruleId: `vendor:${vendor.id}:config:${configFile}`
      });
    }

    for (const provider of vendor.identifiers.terraform_providers) {
      addIndexValue(indexes.terraformProviders, normalizeLower(provider), {
        kind: "vendor",
        vendor,
        ruleId: `vendor:${vendor.id}:terraform:${provider}`
      });
    }
  }

  return indexes;
}

function fingerprintVendor(fingerprint, vendorsById) {
  return fingerprint.result.vendor_id ? vendorsById.get(fingerprint.result.vendor_id) ?? null : null;
}

function buildFingerprintLookupIndexes(fingerprintDatabase = { fingerprints: [] }, vendorsById = new Map()) {
  const database = assertFingerprintDatabase(fingerprintDatabase);
  const indexes = {
    packages: new Map(),
    domains: new Map(),
    envPatterns: [],
    dockerImages: new Map(),
    dockerImagePatterns: [],
    githubActions: new Map(),
    githubActionRepositories: new Map(),
    configFiles: new Map(),
    terraformProviders: new Map(),
    textPatterns: []
  };

  for (const fingerprint of database.fingerprints) {
    const baseMatch = {
      kind: "fingerprint",
      fingerprint,
      vendor: fingerprintVendor(fingerprint, vendorsById),
      ruleId: fingerprint.id
    };

    if (fingerprint.rule_type === "package") {
      addIndexValue(
        indexes.packages,
        `${fingerprint.match.ecosystem}:${normalizePackageName(fingerprint.match.package_name, fingerprint.match.ecosystem)}`,
        baseMatch
      );
    } else if (fingerprint.rule_type === "domain") {
      for (const domain of fingerprint.match.domains) {
        addIndexValue(indexes.domains, normalizeDomain(domain), baseMatch);
      }
    } else if (fingerprint.rule_type === "env_var") {
      indexes.envPatterns.push({
        ...baseMatch,
        pattern: new RegExp(fingerprint.match.pattern, fingerprint.match.case_sensitive ? "" : "i")
      });
    } else if (fingerprint.rule_type === "docker_image") {
      for (const image of fingerprint.match.image_patterns) {
        if (image.includes("*")) {
          indexes.dockerImagePatterns.push({
            ...baseMatch,
            pattern: wildcardPattern(image),
            patternWithoutRegistry: wildcardPattern(dockerImageWithoutRegistry(image))
          });
        } else {
          addIndexValue(indexes.dockerImages, normalizeDockerImage(image), baseMatch);
          addIndexValue(indexes.dockerImages, dockerImageWithoutRegistry(image), baseMatch);
        }
      }
    } else if (fingerprint.rule_type === "github_action") {
      addIndexValue(indexes.githubActions, normalizeAction(fingerprint.match.action), baseMatch);
      addIndexValue(indexes.githubActionRepositories, actionRepository(fingerprint.match.action), baseMatch);
    } else if (fingerprint.rule_type === "config_file") {
      for (const filePath of fingerprint.match.paths) {
        addIndexValue(indexes.configFiles, normalizeLower(filePath), baseMatch);
      }
    } else if (fingerprint.rule_type === "terraform_provider") {
      for (const provider of fingerprint.match.provider_names) {
        addIndexValue(indexes.terraformProviders, normalizeLower(provider), baseMatch);
      }
    } else if (fingerprint.rule_type === "text_pattern") {
      indexes.textPatterns.push({
        ...baseMatch,
        pattern: new RegExp(fingerprint.match.regex),
        supportedFileTypes: new Set(fingerprint.match.supported_file_types)
      });
    }
  }

  return indexes;
}

function firstMatchesFromMap(map, key) {
  return map.get(key) ?? [];
}

function candidateEcosystem(candidate) {
  return typeof candidate.metadata?.ecosystem === "string" ? candidate.metadata.ecosystem : "unknown";
}

function matchFromIndexes(candidate, vendorIndexes, fingerprintIndexes) {
  const value = candidate.normalized_value;
  const matches = [];

  if (candidate.evidence_type === "package_name") {
    const ecosystem = candidateEcosystem(candidate);
    const normalized = normalizePackageName(value, ecosystem);
    matches.push(...firstMatchesFromMap(vendorIndexes.packages, `${ecosystem}:${normalized}`));
    if (ecosystem !== "npm" && ecosystem !== "pypi" && ecosystem !== "unknown") {
      matches.push(...firstMatchesFromMap(vendorIndexes.packages, `other:${normalized}`));
    }
    if (ecosystem === "unknown") {
      matches.push(...firstMatchesFromMap(vendorIndexes.packageNames, normalized));
    }
    matches.push(...firstMatchesFromMap(fingerprintIndexes.packages, `${ecosystem}:${normalized}`));
  } else if (candidate.evidence_type === "domain") {
    matches.push(...firstMatchesFromMap(vendorIndexes.domains, normalizeDomain(value)));
    matches.push(...firstMatchesFromMap(fingerprintIndexes.domains, normalizeDomain(value)));
  } else if (candidate.evidence_type === "env_var") {
    matches.push(...vendorIndexes.envPatterns.filter((match) => match.pattern.test(value)));
    matches.push(...fingerprintIndexes.envPatterns.filter((match) => match.pattern.test(value)));
  } else if (candidate.evidence_type === "docker_image") {
    const normalized = normalizeDockerImage(value);
    const withoutRegistry = dockerImageWithoutRegistry(value);
    matches.push(...firstMatchesFromMap(vendorIndexes.dockerImages, normalized));
    matches.push(...firstMatchesFromMap(vendorIndexes.dockerImages, withoutRegistry));
    matches.push(...vendorIndexes.dockerImagePatterns.filter((match) => match.pattern.test(normalized) || match.patternWithoutRegistry.test(withoutRegistry)));
    matches.push(...firstMatchesFromMap(fingerprintIndexes.dockerImages, normalized));
    matches.push(...firstMatchesFromMap(fingerprintIndexes.dockerImages, withoutRegistry));
    matches.push(...fingerprintIndexes.dockerImagePatterns.filter((match) => match.pattern.test(normalized) || match.patternWithoutRegistry.test(withoutRegistry)));
  } else if (candidate.evidence_type === "github_action") {
    const normalized = normalizeAction(value);
    matches.push(...firstMatchesFromMap(vendorIndexes.githubActions, normalized));
    matches.push(...firstMatchesFromMap(vendorIndexes.githubActionRepositories, actionRepository(normalized)));
    matches.push(...firstMatchesFromMap(fingerprintIndexes.githubActions, normalized));
    matches.push(...firstMatchesFromMap(fingerprintIndexes.githubActionRepositories, actionRepository(normalized)));
  } else if (candidate.evidence_type === "config_file") {
    const basename = path.posix.basename(value);
    matches.push(...firstMatchesFromMap(vendorIndexes.configFiles, normalizeLower(value)));
    matches.push(...firstMatchesFromMap(vendorIndexes.configFiles, normalizeLower(basename)));
    matches.push(...firstMatchesFromMap(fingerprintIndexes.configFiles, normalizeLower(value)));
    matches.push(...firstMatchesFromMap(fingerprintIndexes.configFiles, normalizeLower(basename)));
  } else if (candidate.evidence_type === "terraform_provider") {
    matches.push(...firstMatchesFromMap(vendorIndexes.terraformProviders, normalizeLower(value)));
    matches.push(...(fingerprintIndexes.terraformProviders.get(normalizeLower(value)) ?? []));
  } else if (candidate.evidence_type === "text_pattern") {
    matches.push(
      ...fingerprintIndexes.textPatterns.filter(
        (match) => match.supportedFileTypes.has(candidate.source_type) && match.pattern.test(value)
      )
    );
  }

  const seen = new Set();
  return matches.filter((match) => {
    const key = `${match.kind}:${match.ruleId}:${match.vendor?.id ?? match.fingerprint?.result.vendor_id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createVendorMatcher({ vendorDatabase, fingerprintDatabase = { fingerprints: [] } }) {
  const vendorIndexes = buildVendorLookupIndexes(vendorDatabase);
  const fingerprintIndexes = buildFingerprintLookupIndexes(fingerprintDatabase, vendorIndexes.vendorsById);

  return {
    vendorDatabase: assertVendorDatabase(vendorDatabase),
    fingerprintDatabase: assertFingerprintDatabase(fingerprintDatabase),
    indexes: {
      vendorsById: vendorIndexes.vendorsById
    },
    matchCandidate(candidate) {
      return matchFromIndexes(candidate, vendorIndexes, fingerprintIndexes);
    }
  };
}

export const ruleSchemas = {
  vendorDatabase: { validate: validateVendorDatabase, assert: assertVendorDatabase },
  fingerprintDatabase: { validate: validateFingerprintDatabase, assert: assertFingerprintDatabase },
  alternativesDatabase: { validate: validateAlternativesDatabase, assert: assertAlternativesDatabase }
};
