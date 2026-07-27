import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

import { redactKeywordValues } from "./keyword-config.mjs";

function requireString(value, field, organization) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      `Invalid repository inventory for ${organization}: ${field} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function normalizeRepository(raw, organization) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid repository inventory for ${organization}: expected an object.`);
  }

  const visibility = requireString(raw.visibility, "visibility", organization).toLowerCase();
  if (visibility !== "public" && visibility !== "private" && visibility !== "internal") {
    throw new Error(
      `Invalid repository inventory for ${organization}: unsupported visibility "${visibility}".`,
    );
  }

  return {
    name: requireString(raw.name, "name", organization),
    nameWithOwner: requireString(raw.nameWithOwner, "nameWithOwner", organization),
    visibility,
    url: requireString(raw.url, "url", organization),
    isArchived: raw.isArchived === true,
    isEmpty: raw.isEmpty === true,
    description: typeof raw.description === "string" ? raw.description : "",
  };
}

export function parseRepositoryInventory(stdout, organization) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Invalid repository inventory for ${organization}: malformed JSON.`, {
      cause: error,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid repository inventory for ${organization}: expected an array.`);
  }
  return parsed.map((repository) => normalizeRepository(repository, organization));
}

function runCommand(
  command,
  args,
  {
    cwd = process.cwd(),
    timeoutMs = 120_000,
  } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`Cannot start ${command}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || `exit ${result.status}`;
    throw new Error(`${command} failed: ${detail}`);
  }
  return result.stdout;
}

export function listOrganizationRepositories(
  organization,
  { commandRunner = runCommand } = {},
) {
  if (typeof organization !== "string" || !organization.trim()) {
    throw new Error("Organization must be a non-empty string.");
  }
  const stdout = commandRunner("gh", [
    "repo",
    "list",
    organization.trim(),
    "--limit",
    "1000",
    "--json",
    "name,nameWithOwner,visibility,url,isArchived,isEmpty,description",
  ]);
  return parseRepositoryInventory(stdout, organization.trim());
}

export function viewRepository(
  nameWithOwner,
  { commandRunner = runCommand } = {},
) {
  if (typeof nameWithOwner !== "string" || !nameWithOwner.trim()) {
    throw new Error("Repository name must be a non-empty string.");
  }
  const stdout = commandRunner("gh", [
    "repo",
    "view",
    nameWithOwner.trim(),
    "--json",
    "name,nameWithOwner,visibility,url,isArchived,isEmpty,description",
  ]);
  const [repository] = parseRepositoryInventory(
    `[${stdout}]`,
    nameWithOwner.trim().split("/")[0],
  );
  return repository;
}

function privateValueDigest(value) {
  return createHash("sha256")
    .update(value.toLocaleLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 12);
}

function keywordId(value) {
  return `private-repo:${privateValueDigest(value)}`;
}

export function redactedRepositoryLabel(nameWithOwner) {
  return `private-repository:${privateValueDigest(nameWithOwner)}`;
}

export function derivePrivateRepositoryKeywords(repositories) {
  const byValue = new Map();
  for (const repository of repositories) {
    if (repository.visibility === "public") continue;
    for (const value of [repository.nameWithOwner, repository.name]) {
      const key = value.toLocaleLowerCase();
      if (!byValue.has(key)) {
        byValue.set(key, { id: keywordId(value), value, match: "token" });
      }
    }
  }
  return [...byValue.values()];
}

function includesMetadataKeyword(value, keyword) {
  if (keyword.match === "substring") {
    return value.includes(keyword.lowercaseValue);
  }
  const tokenCharacter = (character) =>
    character !== undefined && /[\p{L}\p{N}_]/u.test(character);
  let start = value.indexOf(keyword.lowercaseValue);
  while (start >= 0) {
    const end = start + keyword.lowercaseValue.length;
    if (!tokenCharacter(value[start - 1]) && !tokenCharacter(value[end])) {
      return true;
    }
    start = value.indexOf(keyword.lowercaseValue, start + 1);
  }
  return false;
}

export function scanPublicRepositoryMetadata(repositories, keywords) {
  const searchableKeywords = keywords.map((keyword) => ({
    id: keyword.id,
    match: keyword.match ?? "substring",
    lowercaseValue: keyword.value.toLocaleLowerCase(),
  }));
  const findings = [];

  for (const repository of repositories) {
    if (repository.visibility !== "public") continue;
    for (const [field, value] of [
      ["name", repository.name],
      ["description", repository.description],
    ]) {
      if (!value) continue;
      const lowercaseValue = value.toLocaleLowerCase();
      const keywordIds = searchableKeywords
        .filter((keyword) => includesMetadataKeyword(lowercaseValue, keyword))
        .map((keyword) => keyword.id);
      if (keywordIds.length === 0) continue;
      findings.push({
        repository: redactKeywordValues(repository.nameWithOwner, keywords),
        surface: "metadata",
        field,
        keywordIds,
      });
    }
  }
  return findings;
}

export function listTrackedFiles(
  repositoryPath,
  { commandRunner = runCommand } = {},
) {
  const stdout = commandRunner(
    "git",
    ["ls-files", "-z"],
    { cwd: repositoryPath, timeoutMs: 30_000 },
  );
  return stdout.split("\0").filter(Boolean);
}

export function parseGitHubRepositoryName(remote) {
  if (typeof remote !== "string") return null;
  const trimmed = remote.trim();
  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(trimmed);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  return null;
}

export function listWorkspaceRepositories(
  workspacePath,
  { commandRunner = runCommand } = {},
) {
  const workspace = resolve(workspacePath);
  const candidates = [workspace];
  for (const entry of readdirSync(workspace, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    candidates.push(join(workspace, entry.name));
  }

  const repositories = [];
  for (const candidate of candidates) {
    if (!existsSync(join(candidate, ".git"))) continue;
    try {
      if (!statSync(candidate).isDirectory()) continue;
      const remote = commandRunner(
        "git",
        ["remote", "get-url", "origin"],
        { cwd: candidate, timeoutMs: 10_000 },
      );
      const nameWithOwner = parseGitHubRepositoryName(remote);
      if (nameWithOwner) repositories.push({ nameWithOwner, path: candidate });
    } catch {
      // A local repo without a readable origin cannot be joined to GitHub visibility.
    }
  }
  return repositories;
}

export function chooseWorkspaceRepository(repository, workspaceRepositories) {
  const matches = workspaceRepositories.filter(
    (candidate) =>
      candidate.nameWithOwner.toLocaleLowerCase()
      === repository.nameWithOwner.toLocaleLowerCase(),
  );
  if (matches.length === 0) return null;
  return matches.find(
    (candidate) =>
      basename(candidate.path).toLocaleLowerCase()
      === repository.name.toLocaleLowerCase(),
  ) ?? matches[0];
}
