import path from "node:path";

const JSON_PARSERS = new Set([
  "package_json",
  "package_lock",
  "pipfile_lock",
  "composer_json",
  "composer_lock"
]);

const TOML_PARSERS = new Set([
  "pyproject_toml",
  "pipfile",
  "cargo_toml",
  "fly_toml",
  "netlify_toml",
  "wrangler_toml"
]);

const YAML_PARSERS = new Set([
  "pnpm_lock",
  "docker_compose",
  "github_actions",
  "config_file",
  "render_yaml",
  "dependabot_yaml"
]);

const TEXT_PATTERN_SOURCE_TYPES = new Set([
  "config_file",
  "workflow",
  "dockerfile",
  "terraform",
  "text"
]);

const GENERIC_DOCKER_IMAGES = new Set([
  "alpine",
  "busybox",
  "debian",
  "ubuntu",
  "node",
  "python",
  "ruby",
  "golang",
  "nginx",
  "httpd",
  "postgres",
  "mysql",
  "redis"
]);

const CONFIG_FILE_HINTS = new Map([
  ["vercel.json", "vercel"],
  ["netlify.toml", "netlify"],
  ["render.yaml", "render"],
  ["render.yml", "render"],
  ["railway.json", "railway"],
  ["fly.toml", "fly"],
  ["firebase.json", "firebase"],
  ["wrangler.toml", "cloudflare"],
  ["wrangler.json", "cloudflare"],
  ["wrangler.jsonc", "cloudflare"],
  ["sentry.properties", "sentry"],
  ["dependabot.yml", "github_dependabot"],
  ["dependabot.yaml", "github_dependabot"],
  ["renovate.json", "renovate"]
]);

function warning(sourceFile, parser, message) {
  return { path: sourceFile, parser, message };
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r\n|\r|\n/).length;
}

function createResult() {
  return {
    evidence_candidates: [],
    parser_warnings: []
  };
}

function addCandidate(result, candidate, seen) {
  const key = [
    candidate.source_file,
    candidate.source_type,
    candidate.evidence_type,
    candidate.normalized_value,
    candidate.parser,
    candidate.line_number ?? ""
  ].join("\u0000");

  if (seen.has(key)) return;
  seen.add(key);
  result.evidence_candidates.push(candidate);
}

function makeCandidate(context, evidenceType, rawValueSafe, normalizedValue, options = {}) {
  return {
    source_file: context.sourceFile,
    source_type: context.sourceType,
    evidence_type: evidenceType,
    raw_value_safe: rawValueSafe,
    normalized_value: normalizedValue,
    parser: context.parser,
    confidence_hint: options.confidence_hint ?? "medium",
    line_number: options.line_number ?? null,
    redacted: options.redacted ?? false,
    ...(options.metadata ? { metadata: options.metadata } : {})
  };
}

function parseJson(content) {
  return JSON.parse(content);
}

function stripJsonComments(content) {
  let output = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const current = content[index];
    const next = content[index + 1];

    if (inLineComment) {
      if (current === "\n" || current === "\r") {
        inLineComment = false;
        output += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      } else if (current === "\n" || current === "\r") {
        output += current;
      }
      continue;
    }

    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function parseJsonLike(content, allowComments = false) {
  return JSON.parse(allowComments ? stripJsonComments(content) : content);
}

function normalizeNpmPackageName(name) {
  return name.trim().toLowerCase();
}

function normalizePythonPackageName(name) {
  return name.trim().replace(/[_.]+/g, "-").toLowerCase();
}

function addPackageCandidate(result, seen, context, packageName, options = {}) {
  if (typeof packageName !== "string") return;
  const trimmed = packageName.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.includes("://")) return;

  const normalized =
    options.ecosystem === "pypi" ? normalizePythonPackageName(trimmed) : normalizeNpmPackageName(trimmed);

  addCandidate(
    result,
    makeCandidate(context, "package_name", trimmed, normalized, {
      confidence_hint: "high",
      line_number: options.line_number ?? null,
      metadata: {
        ecosystem: options.ecosystem ?? "unknown",
        ...(options.dependency_kind ? { dependency_kind: options.dependency_kind } : {}),
        ...(options.version ? { version: String(options.version) } : {})
      }
    }),
    seen
  );
}

function addDomainCandidate(result, seen, context, domain, lineNumber, confidenceHint = "medium") {
  const normalized = normalizeDomain(domain);
  if (!normalized || !isExternalDomain(normalized)) return;

  addCandidate(
    result,
    makeCandidate(context, "domain", normalized, normalized, {
      confidence_hint: confidenceHint,
      line_number: lineNumber
    }),
    seen
  );
}

function normalizeDomain(domain) {
  if (typeof domain !== "string") return null;

  const normalized = domain
    .trim()
    .replace(/^\*\./, "")
    .replace(/[).,\];:]+$/g, "")
    .toLowerCase();

  if (!normalized.includes(".")) return null;
  if (normalized.length > 253) return null;
  return normalized;
}

function isExternalDomain(domain) {
  if (!domain || domain === "localhost") return false;
  if (domain.endsWith(".local") || domain.endsWith(".localhost")) return false;
  if (domain === "example.com" || domain === "example.org" || domain === "example.net") return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) return false;
  return true;
}

function extractDomainsFromText(result, seen, context, content, confidenceHint = "medium") {
  const urlPattern = /\bhttps?:\/\/[^\s"'`<>)\]}]+/gi;
  let match;

  while ((match = urlPattern.exec(content))) {
    try {
      const url = new URL(match[0]);
      addDomainCandidate(
        result,
        seen,
        context,
        url.hostname,
        lineNumberForIndex(content, match.index),
        confidenceHint
      );
    } catch {
      // Ignore malformed URLs; token-level domain extraction below may still catch safe domains.
    }
  }

  const domainPattern = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi;
  while ((match = domainPattern.exec(content))) {
    addDomainCandidate(
      result,
      seen,
      context,
      match[0],
      lineNumberForIndex(content, match.index),
      confidenceHint
    );
  }
}

function addRegistryDomains(result, seen, context, value, lineNumber = null) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    addDomainCandidate(result, seen, context, url.hostname, lineNumber, "medium");
  } catch {
    // Registry fields are optional and often absent; malformed values are simply not evidence.
  }
}

function findJsonKeyLine(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedKey}"\\s*:`).exec(content);
  return match ? lineNumberForIndex(content, match.index) : null;
}

function packageDependencyEntries(field, dependencies) {
  if (Array.isArray(dependencies)) {
    if (field !== "bundledDependencies" && field !== "bundleDependencies") return [];
    return dependencies
      .filter((packageName) => typeof packageName === "string")
      .map((packageName) => [packageName, undefined]);
  }

  if (!dependencies || typeof dependencies !== "object") return [];
  return Object.entries(dependencies);
}

function parsePackageJson(context, content) {
  const result = createResult();
  const seen = new Set();
  let parsed;

  try {
    parsed = parseJson(content);
  } catch {
    result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid JSON; package manifest was skipped."));
    return result;
  }

  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "bundledDependencies",
    "bundleDependencies"
  ]) {
    const dependencies = parsed[field];
    for (const [packageName, version] of packageDependencyEntries(field, dependencies)) {
      addPackageCandidate(result, seen, context, packageName, {
        ecosystem: "npm",
        dependency_kind: field,
        version,
        line_number: findJsonKeyLine(content, packageName)
      });
    }
  }

  addRegistryDomains(result, seen, context, parsed.publishConfig?.registry, findJsonKeyLine(content, "registry"));
  addRegistryDomains(result, seen, context, parsed.config?.registry, findJsonKeyLine(content, "registry"));

  return result;
}

function packageFromNodeModulesPath(packagePath) {
  const parts = packagePath.split("/");
  const nodeModulesIndex = parts.lastIndexOf("node_modules");
  if (nodeModulesIndex === -1) return null;
  const first = parts[nodeModulesIndex + 1];
  if (!first) return null;
  if (first.startsWith("@")) {
    const second = parts[nodeModulesIndex + 2];
    return second ? `${first}/${second}` : null;
  }
  return first;
}

function parsePackageLock(context, content) {
  const result = createResult();
  const seen = new Set();
  let parsed;

  try {
    parsed = parseJson(content);
  } catch {
    result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid JSON; package lockfile was skipped."));
    return result;
  }

  if (parsed.dependencies && typeof parsed.dependencies === "object") {
    for (const [packageName, details] of Object.entries(parsed.dependencies)) {
      addPackageCandidate(result, seen, context, packageName, {
        ecosystem: "npm",
        dependency_kind: "lockfile_dependency",
        version: details?.version,
        line_number: findJsonKeyLine(content, packageName)
      });
      addRegistryDomains(result, seen, context, details?.resolved, findJsonKeyLine(content, "resolved"));
    }
  }

  if (parsed.packages && typeof parsed.packages === "object") {
    for (const [packagePath, details] of Object.entries(parsed.packages)) {
      const packageName = packageFromNodeModulesPath(packagePath);
      if (!packageName) continue;
      addPackageCandidate(result, seen, context, packageName, {
        ecosystem: "npm",
        dependency_kind: "lockfile_package",
        version: details?.version,
        line_number: findJsonKeyLine(content, packagePath)
      });
      addRegistryDomains(result, seen, context, details?.resolved, findJsonKeyLine(content, "resolved"));
    }
  }

  return result;
}

function parsePnpmLock(context, content) {
  const result = createResult();
  const seen = new Set();
  addYamlWarnings(result, context, content);

  const packageEntryPattern = /^\s{2,}\/?((?:@[^/\s:'"]+\/)?[^@\s():'"]+)@[^:\s]+.*:\s*$/gm;
  let match;
  while ((match = packageEntryPattern.exec(content))) {
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "npm",
      dependency_kind: "lockfile_package",
      line_number: lineNumberForIndex(content, match.index)
    });
  }

  const dependencyKeyPattern = /^\s{4,}['"]?((?:@[^/\s:'"]+\/)?[a-z0-9][^:'"\s]*)['"]?:\s*$/gim;
  while ((match = dependencyKeyPattern.exec(content))) {
    if (["specifier", "version", "dependencies", "devDependencies", "optionalDependencies"].includes(match[1])) {
      continue;
    }
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "npm",
      dependency_kind: "lockfile_dependency",
      line_number: lineNumberForIndex(content, match.index)
    });
  }

  extractDomainsFromText(result, seen, context, content, "medium");
  return result;
}

function parseYarnLock(context, content) {
  const result = createResult();
  const seen = new Set();
  addYamlWarnings(result, context, content);

  const entryPattern = /^(?:"([^"]+)"|'([^']+)'|([^\s].*?)):\s*$/gm;
  let match;
  while ((match = entryPattern.exec(content))) {
    const key = match[1] ?? match[2] ?? match[3];
    for (const descriptor of key.split(/\s*,\s*/)) {
      const packageName = packageNameFromYarnDescriptor(descriptor.trim());
      if (packageName) {
        addPackageCandidate(result, seen, context, packageName, {
          ecosystem: "npm",
          dependency_kind: "lockfile_package",
          line_number: lineNumberForIndex(content, match.index)
        });
      }
    }
  }

  extractDomainsFromText(result, seen, context, content, "medium");
  return result;
}

function packageNameFromYarnDescriptor(descriptor) {
  if (!descriptor) return null;
  const withoutProtocol = descriptor.replace(/^npm:/, "");
  if (withoutProtocol.startsWith("@")) {
    const parts = withoutProtocol.split("@");
    return parts.length >= 3 ? `@${parts[1]}` : null;
  }
  const atIndex = withoutProtocol.indexOf("@");
  return atIndex > 0 ? withoutProtocol.slice(0, atIndex) : null;
}

function parsePythonRequirementName(value) {
  const trimmed = value
    .split(/\s+#/)[0]
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) return null;
  if (/^(git|https?|file):/i.test(trimmed)) return null;

  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]+\])?\s*(?:[<>=!~]=?|;|$)/.exec(trimmed);
  return match?.[1] ?? null;
}

function extractPythonRequirementOptionDomains(result, seen, context, line, lineNumber) {
  const trimmed = line.split(/\s+#/)[0].trim();
  const optionMatch = /^(?:--index-url|--extra-index-url|-i|--trusted-host)(?:[=\s]+)(\S+)/.exec(trimmed);
  if (!optionMatch) return;

  const value = optionMatch[1].replace(/^['"]|['"]$/g, "");
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      addDomainCandidate(result, seen, context, url.hostname, lineNumber, "medium");
    } catch {
      // Invalid option values are not useful evidence.
    }
    return;
  }

  addDomainCandidate(result, seen, context, value, lineNumber, "medium");
}

function parsePythonRequirements(context, content) {
  const result = createResult();
  const seen = new Set();
  const lines = content.split(/\r\n|\r|\n/);

  lines.forEach((line, index) => {
    extractPythonRequirementOptionDomains(result, seen, context, line, index + 1);
    const packageName = parsePythonRequirementName(line);
    if (!packageName) return;
    addPackageCandidate(result, seen, context, packageName, {
      ecosystem: "pypi",
      dependency_kind: "requirements",
      line_number: index + 1
    });
  });

  return result;
}

function parsePyprojectToml(context, content) {
  const result = createResult();
  const seen = new Set();
  addTomlWarnings(result, context, content);

  const lines = content.split(/\r\n|\r|\n/);
  let section = "";
  let inProjectDependencies = false;

  lines.forEach((line, index) => {
    const trimmed = stripInlineTomlComment(line).trim();
    const sectionMatch = /^\[([^\]]+)]$/.exec(trimmed);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      inProjectDependencies = false;
      return;
    }

    if (/^dependencies\s*=\s*\[/.test(trimmed) && section === "project") {
      inProjectDependencies = true;
    }

    if (inProjectDependencies) {
      const stringMatches = [...trimmed.matchAll(/"([^"]+)"|'([^']+)'/g)];
      for (const stringMatch of stringMatches) {
        const packageName = parsePythonRequirementName(stringMatch[1] ?? stringMatch[2]);
        if (packageName) {
          addPackageCandidate(result, seen, context, packageName, {
            ecosystem: "pypi",
            dependency_kind: "project.dependencies",
            line_number: index + 1
          });
        }
      }
      if (trimmed.includes("]")) inProjectDependencies = false;
      return;
    }

    if (
      section === "tool.poetry.dependencies" ||
      section === "tool.poetry.group.dev.dependencies" ||
      section.startsWith("tool.poetry.group.") && section.endsWith(".dependencies")
    ) {
      const dependencyMatch = /^([A-Za-z0-9_.-]+)\s*=/.exec(trimmed);
      if (dependencyMatch && dependencyMatch[1].toLowerCase() !== "python") {
        addPackageCandidate(result, seen, context, dependencyMatch[1], {
          ecosystem: "pypi",
          dependency_kind: section,
          line_number: index + 1
        });
      }
    }
  });

  return result;
}

function parsePoetryLock(context, content) {
  const result = createResult();
  const seen = new Set();
  addTomlWarnings(result, context, content);

  const namePattern = /^name\s*=\s*["']([^"']+)["']\s*$/gm;
  let match;
  while ((match = namePattern.exec(content))) {
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "pypi",
      dependency_kind: "poetry_lock",
      line_number: lineNumberForIndex(content, match.index)
    });
  }

  return result;
}

function parsePipfile(context, content) {
  const result = createResult();
  const seen = new Set();
  addTomlWarnings(result, context, content);

  let section = "";
  content.split(/\r\n|\r|\n/).forEach((line, index) => {
    const trimmed = stripInlineTomlComment(line).trim();
    const sectionMatch = /^\[([^\]]+)]$/.exec(trimmed);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      return;
    }

    if (section !== "packages" && section !== "dev-packages") return;
    const dependencyMatch = /^([A-Za-z0-9_.-]+)\s*=/.exec(trimmed);
    if (!dependencyMatch) return;
    addPackageCandidate(result, seen, context, dependencyMatch[1], {
      ecosystem: "pypi",
      dependency_kind: section,
      line_number: index + 1
    });
  });

  return result;
}

function parsePipfileLock(context, content) {
  const result = createResult();
  const seen = new Set();
  let parsed;

  try {
    parsed = parseJson(content);
  } catch {
    result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid JSON; Pipfile lock was skipped."));
    return result;
  }

  for (const section of ["default", "develop"]) {
    const dependencies = parsed[section];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const packageName of Object.keys(dependencies)) {
      addPackageCandidate(result, seen, context, packageName, {
        ecosystem: "pypi",
        dependency_kind: section,
        line_number: findJsonKeyLine(content, packageName)
      });
    }
  }

  return result;
}

function parseDockerImageName(value) {
  const image = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+AS\s+.+$/i, "")
    .replace(/\s+as\s+.+$/i, "");

  if (!image || image.startsWith("$") || image.includes("${")) return null;
  return image;
}

function normalizeDockerImage(image) {
  const withoutDigest = image.split("@")[0];
  const slashParts = withoutDigest.split("/");
  const last = slashParts[slashParts.length - 1];
  const taglessLast = last.includes(":") ? last.slice(0, last.lastIndexOf(":")) : last;
  return [...slashParts.slice(0, -1), taglessLast].join("/").toLowerCase();
}

function dockerRegistryDomain(image) {
  const first = image.split("/")[0];
  if (!first || !first.includes(".") && !first.includes(":")) return null;
  return first.split(":")[0].toLowerCase();
}

function addDockerImageCandidate(result, seen, context, image, lineNumber, confidenceHint = "medium") {
  const parsed = parseDockerImageName(image);
  if (!parsed) return;
  const normalized = normalizeDockerImage(parsed);
  const ownerOrName = normalized.split("/").slice(-2)[0] ?? normalized;
  const imageName = normalized.split("/").at(-1);
  const confidence =
    GENERIC_DOCKER_IMAGES.has(imageName) && normalized.split("/").length === 1 ? "low" : confidenceHint;

  addCandidate(
    result,
    makeCandidate(context, "docker_image", parsed, normalized, {
      confidence_hint: confidence,
      line_number: lineNumber,
      metadata: { image_owner_or_name: ownerOrName }
    }),
    seen
  );

  addDomainCandidate(result, seen, context, dockerRegistryDomain(parsed), lineNumber, "medium");
}

function parseDockerfile(context, content) {
  const result = createResult();
  const seen = new Set();
  const fromPattern = /^\s*FROM\s+(?:--platform=\S+\s+)?([^\s#]+)(?:\s+AS\s+\S+)?/gim;
  let match;
  while ((match = fromPattern.exec(content))) {
    addDockerImageCandidate(result, seen, context, match[1], lineNumberForIndex(content, match.index));
  }
  return result;
}

function parseDockerCompose(context, content) {
  const result = createResult();
  const seen = new Set();
  addYamlWarnings(result, context, content);

  const imagePattern = /^\s*image\s*:\s*["']?([^"'\s#]+)["']?/gim;
  let match;
  while ((match = imagePattern.exec(content))) {
    addDockerImageCandidate(result, seen, context, match[1], lineNumberForIndex(content, match.index));
  }

  extractDomainsFromText(result, seen, context, content, "medium");
  return result;
}

function parseEnvTemplate(context, content) {
  const result = createResult();
  const seen = new Set();
  const envPattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:)/gm;
  let match;

  while ((match = envPattern.exec(content))) {
    addCandidate(
      result,
      makeCandidate(context, "env_var", match[1], match[1].toUpperCase(), {
        confidence_hint: "medium",
        line_number: lineNumberForIndex(content, match.index),
        redacted: true
      }),
      seen
    );
  }

  return result;
}

function parseGitHubActions(context, content) {
  const result = createResult();
  const seen = new Set();
  addYamlWarnings(result, context, content);

  const usesPattern = /^\s*-?\s*uses\s*:\s*["']?([^"'\s#]+)["']?/gim;
  let match;
  while ((match = usesPattern.exec(content))) {
    const action = match[1].trim();
    if (!isGitHubActionReference(action)) continue;
    addCandidate(
      result,
      makeCandidate(context, "github_action", action, normalizeGitHubAction(action), {
        confidence_hint: "high",
        line_number: lineNumberForIndex(content, match.index)
      }),
      seen
    );
  }

  extractDomainsFromText(result, seen, context, content, "medium");
  return result;
}

function isGitHubActionReference(value) {
  if (value.startsWith("./") || value.startsWith("../")) return false;
  if (value.includes("${{")) return false;
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[^@\s]+$/.test(value);
}

function normalizeGitHubAction(value) {
  const [repository, ref] = value.split("@");
  return `${repository.toLowerCase()}@${ref}`;
}

function parseConfigFile(context, content) {
  const result = createResult();
  const seen = new Set();
  const basename = path.posix.basename(context.sourceFile).toLowerCase();
  const providerHint = CONFIG_FILE_HINTS.get(basename);

  addCandidate(
    result,
    makeCandidate(context, "config_file", basename, basename, {
      confidence_hint: providerHint ? "high" : "medium",
      metadata: providerHint ? { provider_hint: providerHint } : undefined
    }),
    seen
  );

  if (basename.endsWith(".json") || basename.endsWith(".jsonc")) {
    try {
      parseJsonLike(content, basename.endsWith(".jsonc"));
    } catch {
      result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid JSON; config fields may be incomplete."));
    }
  } else if (basename.endsWith(".toml")) {
    addTomlWarnings(result, context, content);
  } else if (basename.endsWith(".yml") || basename.endsWith(".yaml")) {
    addYamlWarnings(result, context, content);
  }

  extractDomainsFromText(result, seen, context, content, "medium");
  return result;
}

function addTerraformProviderCandidate(result, seen, context, value, lineNumber, confidenceHint) {
  if (typeof value !== "string") return;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;

  addCandidate(
    result,
    makeCandidate(context, "terraform_provider", value.trim(), normalized, {
      confidence_hint: confidenceHint,
      line_number: lineNumber
    }),
    seen
  );
}

function requiredProviderBlocks(content) {
  const blocks = [];
  const startPattern = /required_providers\s*(?:=\s*)?\{/g;
  let match;

  while ((match = startPattern.exec(content))) {
    const blockStart = content.indexOf("{", match.index);
    if (blockStart === -1) continue;

    let depth = 0;
    for (let index = blockStart; index < content.length; index += 1) {
      const char = content[index];
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        blocks.push({
          start: blockStart + 1,
          content: content.slice(blockStart + 1, index)
        });
        startPattern.lastIndex = index + 1;
        break;
      }
    }
  }

  return blocks;
}

function parseTerraform(context, content) {
  const result = createResult();
  const seen = new Set();

  for (const block of requiredProviderBlocks(content)) {
    const providerSourcePattern = /source\s*=\s*["']([^"']+)["']/g;
    let match;
    while ((match = providerSourcePattern.exec(block.content))) {
      addTerraformProviderCandidate(
        result,
        seen,
        context,
        match[1],
        lineNumberForIndex(content, block.start + match.index),
        "high"
      );
    }

    const requiredProviderPattern = /^\s*([A-Za-z0-9_-]+)\s*=\s*\{/gm;
    while ((match = requiredProviderPattern.exec(block.content))) {
      addTerraformProviderCandidate(
        result,
        seen,
        context,
        match[1],
        lineNumberForIndex(content, block.start + match.index),
        "medium"
      );
    }
  }

  const providerDeclarationPattern = /^\s*provider\s+["']([^"']+)["']/gm;
  let match;
  while ((match = providerDeclarationPattern.exec(content))) {
    addTerraformProviderCandidate(
      result,
      seen,
      context,
      match[1],
      lineNumberForIndex(content, match.index),
      "high"
    );
  }

  extractDomainsFromText(result, seen, context, content, "medium");
  return result;
}

function parseGoMod(context, content) {
  const result = createResult();
  const seen = new Set();
  const lines = content.split(/\r\n|\r|\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("module ") || trimmed.startsWith("go ")) return;
    const match = /^(?:require\s+)?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)\s+v/.exec(trimmed);
    if (!match) return;
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "go",
      dependency_kind: "go_require",
      line_number: index + 1
    });
  });

  return result;
}

function parseCargoToml(context, content) {
  const result = createResult();
  const seen = new Set();
  addTomlWarnings(result, context, content);

  let section = "";
  content.split(/\r\n|\r|\n/).forEach((line, index) => {
    const trimmed = stripInlineTomlComment(line).trim();
    const sectionMatch = /^\[([^\]]+)]$/.exec(trimmed);
    if (sectionMatch) {
      section = sectionMatch[1];
      return;
    }
    if (!section.endsWith("dependencies")) return;
    const dependencyMatch = /^([A-Za-z0-9_-]+)\s*=/.exec(trimmed);
    if (!dependencyMatch) return;
    addPackageCandidate(result, seen, context, dependencyMatch[1], {
      ecosystem: "cargo",
      dependency_kind: section,
      line_number: index + 1
    });
  });

  return result;
}

function parseCargoLock(context, content) {
  const result = createResult();
  const seen = new Set();
  const namePattern = /^name\s*=\s*["']([^"']+)["']\s*$/gm;
  let match;
  while ((match = namePattern.exec(content))) {
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "cargo",
      dependency_kind: "cargo_lock",
      line_number: lineNumberForIndex(content, match.index)
    });
  }
  return result;
}

function parseComposerJson(context, content) {
  const result = createResult();
  const seen = new Set();
  let parsed;
  try {
    parsed = parseJson(content);
  } catch {
    result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid JSON; Composer file was skipped."));
    return result;
  }
  for (const field of ["require", "require-dev"]) {
    const dependencies = parsed[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const packageName of Object.keys(dependencies)) {
      if (packageName === "php") continue;
      addPackageCandidate(result, seen, context, packageName, {
        ecosystem: "composer",
        dependency_kind: field,
        line_number: findJsonKeyLine(content, packageName)
      });
    }
  }
  return result;
}

function parseComposerLock(context, content) {
  const result = createResult();
  const seen = new Set();
  let parsed;
  try {
    parsed = parseJson(content);
  } catch {
    result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid JSON; Composer lockfile was skipped."));
    return result;
  }
  for (const field of ["packages", "packages-dev"]) {
    const packages = parsed[field];
    if (!Array.isArray(packages)) continue;
    for (const item of packages) {
      addPackageCandidate(result, seen, context, item?.name, {
        ecosystem: "composer",
        dependency_kind: field,
        version: item?.version,
        line_number: item?.name ? findJsonKeyLine(content, item.name) : null
      });
    }
  }
  return result;
}

function parseGemfile(context, content) {
  const result = createResult();
  const seen = new Set();
  const gemPattern = /^\s*gem\s+["']([^"']+)["']/gm;
  let match;
  while ((match = gemPattern.exec(content))) {
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "rubygems",
      dependency_kind: "gemfile",
      line_number: lineNumberForIndex(content, match.index)
    });
  }
  return result;
}

function parseGemfileLock(context, content) {
  const result = createResult();
  const seen = new Set();
  const gemPattern = /^\s{4}([A-Za-z0-9_.-]+)\s\(/gm;
  let match;
  while ((match = gemPattern.exec(content))) {
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "rubygems",
      dependency_kind: "gemfile_lock",
      line_number: lineNumberForIndex(content, match.index)
    });
  }
  return result;
}

function parseMavenPom(context, content) {
  const result = createResult();
  const seen = new Set();
  const dependencyPattern = /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g;
  let match;
  while ((match = dependencyPattern.exec(content))) {
    addPackageCandidate(result, seen, context, `${match[1]}:${match[2]}`, {
      ecosystem: "maven",
      dependency_kind: "dependency",
      line_number: lineNumberForIndex(content, match.index)
    });
  }
  return result;
}

function parseGradle(context, content) {
  const result = createResult();
  const seen = new Set();
  const dependencyPattern = /\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+["']([^:"']+:[^:"']+):[^"']+["']/g;
  let match;
  while ((match = dependencyPattern.exec(content))) {
    addPackageCandidate(result, seen, context, match[1], {
      ecosystem: "maven",
      dependency_kind: "gradle_dependency",
      line_number: lineNumberForIndex(content, match.index)
    });
  }
  return result;
}

function parseLimitedText(context, content) {
  const result = createResult();
  const seen = new Set();

  if (!TEXT_PATTERN_SOURCE_TYPES.has(context.sourceType)) {
    result.parser_warnings.push(
      warning(context.sourceFile, context.parser, "Limited text parser skipped unsupported source type.")
    );
    return result;
  }

  extractDomainsFromText(result, seen, context, content, "medium");

  const gaPattern = /\bG-[A-Z0-9]{6,}\b/g;
  let match;
  while ((match = gaPattern.exec(content))) {
    addCandidate(
      result,
      makeCandidate(context, "text_pattern", match[0], match[0], {
        confidence_hint: "medium",
        line_number: lineNumberForIndex(content, match.index)
      }),
      seen
    );
  }

  return result;
}

function stripInlineTomlComment(line) {
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "#") {
      return line.slice(0, index);
    }
  }

  return line;
}

function addTomlWarnings(result, context, content) {
  const lines = content.split(/\r\n|\r|\n/);
  let openArray = false;

  lines.forEach((line, index) => {
    const trimmed = stripInlineTomlComment(line).trim();
    if (!trimmed) return;
    if (trimmed.startsWith("[") && !/^\[{1,2}[^\]]+\]{1,2}$/.test(trimmed)) {
      result.parser_warnings.push(warning(context.sourceFile, context.parser, `Invalid TOML-like section at line ${index + 1}.`));
      return;
    }
    if (trimmed.includes("=")) {
      const key = trimmed.split("=")[0].trim();
      if (!key) {
        result.parser_warnings.push(warning(context.sourceFile, context.parser, `Invalid TOML-like assignment at line ${index + 1}.`));
      }
    }
    if (trimmed.includes("[") && !trimmed.includes("]")) openArray = true;
    if (openArray && trimmed.includes("]")) openArray = false;
  });

  if (openArray) {
    result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid TOML-like array; closing bracket was not found."));
  }
}

function addYamlWarnings(result, context, content) {
  const lines = content.split(/\r\n|\r|\n/);
  lines.forEach((line, index) => {
    if (/^\t+/.test(line)) {
      result.parser_warnings.push(warning(context.sourceFile, context.parser, `Invalid YAML indentation at line ${index + 1}.`));
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    if (/^[^:#]+:\s*["'][^"']*$/.test(trimmed)) {
      result.parser_warnings.push(warning(context.sourceFile, context.parser, `Invalid YAML-like quoted value at line ${index + 1}.`));
    }
  });
}

function normalizeParserName(parser) {
  if (parser === "requirements_txt") return "python_requirements";
  if (parser === "docker-compose") return "docker_compose";
  if (parser === "yml" || parser === "yaml") return "config_file";
  return parser;
}

export function parseEvidenceCandidates(input) {
  const context = {
    sourceFile: input.source_file ?? input.path ?? "unknown",
    sourceType: input.source_type ?? input.file_type ?? "unknown",
    parser: normalizeParserName(input.parser ?? "text")
  };
  const content = input.content ?? "";

  switch (context.parser) {
    case "package_json":
      return parsePackageJson(context, content);
    case "package_lock":
      return parsePackageLock(context, content);
    case "pnpm_lock":
      return parsePnpmLock(context, content);
    case "yarn_lock":
      return parseYarnLock(context, content);
    case "python_requirements":
      return parsePythonRequirements(context, content);
    case "pyproject_toml":
      return parsePyprojectToml(context, content);
    case "poetry_lock":
      return parsePoetryLock(context, content);
    case "pipfile":
      return parsePipfile(context, content);
    case "pipfile_lock":
      return parsePipfileLock(context, content);
    case "dockerfile":
      return parseDockerfile(context, content);
    case "docker_compose":
      return parseDockerCompose(context, content);
    case "env_template":
      return parseEnvTemplate(context, content);
    case "github_actions":
      return parseGitHubActions(context, content);
    case "config_file":
      return parseConfigFile(context, content);
    case "terraform":
      return parseTerraform(context, content);
    case "go_mod":
    case "go_sum":
      return parseGoMod(context, content);
    case "cargo_toml":
      return parseCargoToml(context, content);
    case "cargo_lock":
      return parseCargoLock(context, content);
    case "composer_json":
      return parseComposerJson(context, content);
    case "composer_lock":
      return parseComposerLock(context, content);
    case "gemfile":
      return parseGemfile(context, content);
    case "gemfile_lock":
      return parseGemfileLock(context, content);
    case "maven_pom":
      return parseMavenPom(context, content);
    case "gradle":
      return parseGradle(context, content);
    case "text":
    case "limited_text":
      return parseLimitedText(context, content);
    default: {
      const result = createResult();
      if (JSON_PARSERS.has(context.parser)) {
        try {
          parseJson(content);
        } catch {
          result.parser_warnings.push(warning(context.sourceFile, context.parser, "Invalid JSON; parser is not implemented for this file."));
        }
      } else if (TOML_PARSERS.has(context.parser)) {
        addTomlWarnings(result, context, content);
      } else if (YAML_PARSERS.has(context.parser)) {
        addYamlWarnings(result, context, content);
      }
      result.parser_warnings.push(warning(context.sourceFile, context.parser, "Unsupported parser."));
      return result;
    }
  }
}

export const parseContent = parseEvidenceCandidates;
