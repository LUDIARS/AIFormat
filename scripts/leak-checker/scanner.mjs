import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, extname, join } from "node:path";

import {
  normalizeKeywords,
  redactKeywordValues,
} from "./keyword-config.mjs";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".pnpm-store",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "Library",
  "Logs",
  "node_modules",
  "obj",
  "target",
  "Temp",
  "venv",
]);

const IGNORED_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".avi",
  ".bin",
  ".blend",
  ".bmp",
  ".class",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".fbx",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lib",
  ".lock",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".obj",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".psb",
  ".psd",
  ".pdb",
  ".pfx",
  ".so",
  ".sqlite",
  ".ttf",
  ".tga",
  ".wasm",
  ".webm",
  ".webp",
  ".wav",
  ".woff",
  ".woff2",
  ".zip",
]);

const IGNORED_NAMES = new Set([
  "Cargo.lock",
  "env-leak-keywords.json",
  "env-leak-keywords.local.json",
  "package-lock.json",
  "pnpm-lock.yaml",
]);

function escapeRegularExpression(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegularExpression(pattern) {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.?\//, "");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (character === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegularExpression(character);
    }
  }
  return new RegExp(`^${source}$`, "i");
}

function shouldIgnoreFile(relativePath) {
  const name = basename(relativePath);
  if (name.startsWith(".env")) return true;
  if (IGNORED_NAMES.has(name)) return true;
  if (name.endsWith(".min.js") || name.endsWith(".min.css")) return true;
  if (name.endsWith(".db-shm") || name.endsWith(".db-wal")) return true;
  return IGNORED_EXTENSIONS.has(extname(name).toLowerCase());
}

export function createPathFilter(ignorePatterns = []) {
  const ignoreExpressions = ignorePatterns.map(globToRegularExpression);
  return (relativePath) => {
    const normalizedPath = relativePath.replaceAll("\\", "/");
    const segments = normalizedPath.split("/");
    const hasIgnoredDirectory = segments
      .slice(0, -1)
      .some((segment) => IGNORED_DIRECTORIES.has(segment));
    return hasIgnoredDirectory
      || shouldIgnoreFile(normalizedPath)
      || ignoreExpressions.some((expression) => expression.test(normalizedPath));
  };
}

function walkDirectory(
  root,
  ignoreExpressions,
  strict,
  ignoreNestedRepositories,
  relativeBase = "",
) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(join(root, relativeBase), { withFileTypes: true });
  } catch (error) {
    if (strict) throw error;
    return files;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

    const relativePath = relativeBase
      ? `${relativeBase.replaceAll("\\", "/")}/${entry.name}`
      : entry.name;
    if (ignoreExpressions.some((expression) => expression.test(relativePath))) continue;

    if (entry.isDirectory()) {
      if (
        ignoreNestedRepositories
        && existsSync(join(root, relativePath, ".git"))
      ) {
        continue;
      }
      files.push(...walkDirectory(
        root,
        ignoreExpressions,
        strict,
        ignoreNestedRepositories,
        relativePath,
      ));
    } else if (entry.isFile() && !shouldIgnoreFile(relativePath)) {
      files.push({
        fullPath: join(root, relativePath),
        relativePath,
      });
    }
  }
  return files;
}

function readTextFile(path, strict) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    const buffer = readFileSync(path);
    if (buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (strict) throw error;
    return null;
  }
}

function isTokenCharacter(character) {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}

function includesKeyword(text, keyword) {
  if (keyword.match === "substring") {
    return text.includes(keyword.lowercaseValue);
  }

  let start = text.indexOf(keyword.lowercaseValue);
  while (start >= 0) {
    const end = start + keyword.lowercaseValue.length;
    if (!isTokenCharacter(text[start - 1]) && !isTokenCharacter(text[end])) {
      return true;
    }
    start = text.indexOf(keyword.lowercaseValue, start + 1);
  }
  return false;
}

export function createTextScanner(keywords, { includeContent = false } = {}) {
  const normalizedKeywords = normalizeKeywords(keywords);
  const searchableKeywords = normalizedKeywords.map((keyword) => ({
    ...keyword,
    lowercaseValue: keyword.value.toLocaleLowerCase(),
  }));

  return (relativePath, content) => {
    const lowercaseContent = content.toLocaleLowerCase();
    const fileKeywords = searchableKeywords.filter((keyword) =>
      includesKeyword(lowercaseContent, keyword)
    );
    if (fileKeywords.length === 0) return [];

    const findings = [];
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const lowercaseLine = lines[index].toLocaleLowerCase();
      const keywordIds = fileKeywords
        .filter((keyword) => includesKeyword(lowercaseLine, keyword))
        .map((keyword) => keyword.id);
      if (keywordIds.length === 0) continue;

      const finding = {
        file: redactKeywordValues(
          relativePath.replaceAll("\\", "/"),
          normalizedKeywords,
        ),
        line: index + 1,
        keywordIds,
      };
      if (includeContent) finding.content = lines[index].trim().slice(0, 200);
      findings.push(finding);
    }
    return findings;
  };
}

export function scanDirectory(
  root,
  keywords,
  {
    ignorePatterns = [],
    includeContent = false,
    ignoreNestedRepositories = false,
    relativeFiles = null,
    strict = false,
  } = {},
) {
  const normalizedKeywords = normalizeKeywords(keywords);
  if (normalizedKeywords.length === 0) return [];

  const ignoreExpressions = ignorePatterns.map(globToRegularExpression);
  const shouldIgnorePath = createPathFilter(ignorePatterns);
  const scanText = createTextScanner(normalizedKeywords, { includeContent });
  const findings = [];
  const files = relativeFiles === null
    ? walkDirectory(
      root,
      ignoreExpressions,
      strict,
      ignoreNestedRepositories,
    )
    : relativeFiles
      .map((relativePath) => relativePath.replaceAll("\\", "/"))
      .filter((relativePath) => !shouldIgnorePath(relativePath))
      .map((relativePath) => ({
        fullPath: join(root, relativePath),
        relativePath,
      }));

  for (const { fullPath, relativePath } of files) {
    const content = readTextFile(fullPath, strict);
    if (content === null) continue;
    findings.push(...scanText(relativePath, content));
  }

  return findings;
}
