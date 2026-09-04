#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listOrganizationRepositories,
  listWorkspaceRepositories,
  redactedRepositoryLabel,
  selectWorkspaceRepositories,
} from "./leak-checker/github-repositories.mjs";
import {
  loadKeywordConfig,
  normalizeKeywords,
  redactKeywordValues,
} from "./leak-checker/keyword-config.mjs";
import { listPublishedCommitMessages, scanCommitMessages } from "./leak-checker/git-history.mjs";

const USAGE = `Usage:
  node github-public-history-audit.mjs --org <organization> [--org <organization> ...]
    --workspace <path> --keywords-file <path>
    [--json] [--output <path>] [--limit <count>] [--verbose]

Scope:
  Commit messages reachable from the remote refs of repositories that already
  exist directly under the local workspace. GitHub is queried only for
  repository visibility. No repository is cloned.

  This complements github-public-leak-audit.mjs, which scans tracked files but
  not history. Deleting a file does not remove the commit message that named it.

  Findings report redacted repository references, commit ids, and keyword ids;
  keyword values and message text are never included.`;

function parseArguments(args) {
  const options = {
    organizations: [],
    keywordsFile: null,
    workspacePath: null,
    outputPath: null,
    limit: 0,
    json: false,
    verbose: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = () => {
      const next = args[index + 1];
      if (next === undefined) throw new Error(`${argument} requires a value.`);
      index += 1;
      return next;
    };
    if (argument === "--org") options.organizations[options.organizations.length] = value();
    else if (argument === "--workspace") options.workspacePath = resolve(value());
    else if (argument === "--keywords-file") options.keywordsFile = resolve(value());
    else if (argument === "--output") options.outputPath = resolve(value());
    else if (argument === "--limit") {
      const rawLimit = value();
      if (!/^\d+$/.test(rawLimit)) {
        throw new Error("--limit must be a non-negative integer.");
      }
      options.limit = Number(rawLimit);
      if (!Number.isSafeInteger(options.limit)) {
        throw new Error("--limit must be a non-negative integer.");
      }
    } else if (argument === "--json") options.json = true;
    else if (argument === "--verbose") options.verbose = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function assertOptions(options) {
  if (options.organizations.length === 0) throw new Error("At least one --org is required.");
  if (!options.workspacePath) throw new Error("--workspace is required.");
  if (!options.keywordsFile) throw new Error("--keywords-file is required.");
  if (!existsSync(options.workspacePath)) {
    throw new Error("The supplied --workspace path does not exist.");
  }
  if (!existsSync(options.keywordsFile)) {
    throw new Error("The supplied --keywords-file path does not exist.");
  }
  if (!Number.isSafeInteger(options.limit) || options.limit < 0) {
    throw new Error("--limit must be a non-negative integer.");
  }
}

export function auditPublishedHistory({
  repositories,
  workspaceRepositories,
  keywords,
  limit = 0,
  readCommits = listPublishedCommitMessages,
  onScan = () => {},
}) {
  const normalizedKeywords = normalizeKeywords(keywords);
  if (normalizedKeywords.length === 0) {
    throw new Error("At least one keyword is required for a history audit.");
  }
  const findings = [];
  const errors = [];
  let publicRepositoriesScanned = 0;
  let checkoutsScanned = 0;

  for (const repository of repositories) {
    if (repository.visibility !== "public") continue;
    const checkouts = selectWorkspaceRepositories(repository, workspaceRepositories);
    if (checkouts.length === 0) continue;
    publicRepositoriesScanned += 1;
    for (const checkout of checkouts) {
      onScan(repository, checkout);
      try {
        const commits = readCommits(checkout.path, { limit });
        checkoutsScanned += 1;
        for (const finding of scanCommitMessages(commits, normalizedKeywords)) {
          findings[findings.length] = {
            repository: redactKeywordValues(repository.nameWithOwner, normalizedKeywords),
            surface: "published-commit-message",
            commit: finding.commit,
            keywordIds: finding.keywordIds,
          };
        }
      } catch (error) {
        errors[errors.length] = {
          stage: "history-scan",
          repository: redactedRepositoryLabel(repository.nameWithOwner),
          message: redactKeywordValues(
            error instanceof Error ? error.message : String(error),
            normalizedKeywords,
          ),
        };
      }
    }
  }

  // 同じコミットが複数 checkout から出るので畳む。 公開面としては 1 件。
  const seen = new Set();
  const unique = findings.filter((finding) => {
    const key = `${finding.repository}\u0000${finding.commit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    script: "github-public-history-audit",
    // 読めなかったリポを黙って通すと「流出なし」と「見ていない」が同じ結果になる。
    gate: unique.length === 0 && errors.length === 0,
    scope: "commit messages reachable from remote refs of local public repositories",
    findings: unique,
    errors,
    metrics: {
      publicRepositoriesScanned,
      checkoutsScanned,
      findingCount: unique.length,
    },
  };
}

export function historyAuditExitCode(report) {
  if (report.errors.length > 0) return 2;
  if (report.findings.length > 0) return 1;
  return 0;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  assertOptions(options);

  const { keywords } = loadKeywordConfig(options.keywordsFile);
  const workspaceRepositories = listWorkspaceRepositories(options.workspacePath);
  const repositories = options.organizations.flatMap((organization) =>
    listOrganizationRepositories(organization));

  const report = auditPublishedHistory({
    repositories,
    workspaceRepositories,
    keywords,
    limit: options.limit,
    onScan: (repository) => {
      if (!options.verbose) return;
      console.error(`[history] ${redactedRepositoryLabel(repository.nameWithOwner)}`);
    },
  });

  const serialized = JSON.stringify(report, null, 2);
  if (options.outputPath) writeFileSync(options.outputPath, `${serialized}\n`, "utf8");
  if (options.json || !options.outputPath) process.stdout.write(`${serialized}\n`);
  else {
    process.stdout.write(
      `history audit: ${report.metrics.findingCount} finding(s) across `
      + `${report.metrics.publicRepositoriesScanned} public repositories `
      + `(${report.metrics.checkoutsScanned} checkouts).\n`,
    );
  }
  return historyAuditExitCode(report);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n\n${USAGE}\n`);
      process.exitCode = 2;
    },
  );
}

export { main, parseArguments, USAGE };
