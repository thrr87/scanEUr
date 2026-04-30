import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
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
