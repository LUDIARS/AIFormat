import { readFileSync } from "node:fs";

const VISIBILITIES = new Set(["public", "private"]);
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const BRANCH_PATTERN = /^(?![./])(?!.*(?:\.\.|\/\/|@\{|[~^:?*[\]\\]))(?!.*[/.]$).+$/;

function requireString(value, field, index) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Repository ${index}: ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeRepository(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Repository ${index}: expected an object.`);
  }

  const organization = requireString(raw.organization, "organization", index);
  const name = requireString(raw.name, "name", index);
  const localPath = requireString(raw.local_path, "local_path", index);
  const archiveName = requireString(raw.archive_name, "archive_name", index);
  const cleanBranch = requireString(raw.clean_branch, "clean_branch", index);
  const newVisibility = raw.new_visibility ?? "public";
  const archiveVisibility = raw.archive_visibility ?? "private";

  for (const [field, value] of [
    ["organization", organization],
    ["name", name],
    ["archive_name", archiveName],
  ]) {
    if (!REPOSITORY_NAME_PATTERN.test(value)) {
      throw new Error(`Repository ${index}: ${field} contains unsupported characters.`);
    }
  }
  if (archiveName.toLocaleLowerCase() === name.toLocaleLowerCase()) {
    throw new Error(`Repository ${index}: archive_name must differ from name.`);
  }
  if (!BRANCH_PATTERN.test(cleanBranch)) {
    throw new Error(`Repository ${index}: clean_branch is invalid.`);
  }
  if (!VISIBILITIES.has(newVisibility) || archiveVisibility !== "private") {
    throw new Error(
      `Repository ${index}: new_visibility must be public/private and archive_visibility must be private.`,
    );
  }

  return {
    organization,
    name,
    nameWithOwner: `${organization}/${name}`,
    localPath,
    archiveName,
    cleanBranch,
    newVisibility,
    archiveVisibility,
  };
}

export function parseResetManifest(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid reset manifest JSON: ${error.message}`, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reset manifest must be a JSON object.");
  }
  if (parsed.version !== 1) {
    throw new Error("Reset manifest version must be 1.");
  }
  if (!Array.isArray(parsed.repositories) || parsed.repositories.length === 0) {
    throw new Error("Reset manifest must contain at least one repository.");
  }
  const repositories = parsed.repositories.map(normalizeRepository);
  const names = new Set();
  for (const repository of repositories) {
    const key = repository.nameWithOwner.toLocaleLowerCase();
    if (names.has(key)) {
      throw new Error("Reset manifest contains a duplicate repository.");
    }
    names.add(key);
  }
  return { version: 1, repositories };
}

export function loadResetManifest(path) {
  return parseResetManifest(readFileSync(path, "utf8"));
}
