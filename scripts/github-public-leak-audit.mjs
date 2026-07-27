#!/usr/bin/env node

import {
  existsSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  chooseWorkspaceRepository,
  derivePrivateRepositoryKeywords,
  listOrganizationRepositories,
  listTrackedFiles,
  listWorkspaceRepositories,
  redactedRepositoryLabel,
  scanPublicRepositoryMetadata,
  viewRepository,
} from "./leak-checker/github-repositories.mjs";
import {
  loadKeywordConfig,
  normalizeKeywords,
  redactKeywordValues,
} from "./leak-checker/keyword-config.mjs";
import { scanDirectory } from "./leak-checker/scanner.mjs";

const USAGE = `Usage:
  node github-public-leak-audit.mjs --org <organization> [--org <organization> ...]
    --workspace <path> [--target-org <organization> ...]
    [--keywords-file <path>] [--json] [--output <path>] [--verbose]

Scope:
  Git-tracked files in repositories that already exist directly under the local
  workspace. GitHub is queried only for repository metadata and visibility.
  No repository is cloned or downloaded. Private-repository findings are counted
  and ignored; only public-repository findings fail the gate.
  History, issues, pull requests, releases, and wikis are not scanned.`;
const HUMAN_FINDING_LIMIT = 100;

function parseArguments(args) {
  const options = {
    organizations: [],
    targetOrganizations: [],
    keywordsFile: null,
    outputPath: null,
    workspacePath: null,
    json: false,
    verbose: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--org") {
      const organization = args[index + 1];
      if (!organization || organization.startsWith("--")) {
        throw new Error("--org requires an organization name.");
      }
      options.organizations.push(organization);
      index += 1;
    } else if (argument === "--target-org") {
      const organization = args[index + 1];
      if (!organization || organization.startsWith("--")) {
        throw new Error("--target-org requires an organization name.");
      }
      options.targetOrganizations.push(organization);
      index += 1;
    } else if (argument === "--keywords-file") {
      const path = args[index + 1];
      if (!path || path.startsWith("--")) {
        throw new Error("--keywords-file requires a path.");
      }
      options.keywordsFile = resolve(path);
      index += 1;
    } else if (argument === "--output") {
      const path = args[index + 1];
      if (!path || path.startsWith("--")) {
        throw new Error("--output requires a path.");
      }
      options.outputPath = resolve(path);
      index += 1;
    } else if (argument === "--workspace") {
      const path = args[index + 1];
      if (!path || path.startsWith("--")) {
        throw new Error("--workspace requires a path.");
      }
      options.workspacePath = resolve(path);
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--verbose") {
      options.verbose = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  options.organizations = [...new Set(options.organizations)];
  options.targetOrganizations = [...new Set(options.targetOrganizations)];
  if (!options.help && options.organizations.length === 0) {
    throw new Error("At least one --org is required.");
  }
  if (!options.help && !options.workspacePath) {
    throw new Error("--workspace is required; repositories are never cloned or downloaded.");
  }
  if (options.targetOrganizations.length === 0) {
    options.targetOrganizations = [...options.organizations];
  }
  const inventoryOrganizations = new Set(
    options.organizations.map((organization) => organization.toLocaleLowerCase()),
  );
  for (const organization of options.targetOrganizations) {
    if (!inventoryOrganizations.has(organization.toLocaleLowerCase())) {
      throw new Error(`--target-org must also be supplied with --org: ${organization}`);
    }
  }
  if (options.keywordsFile && !existsSync(options.keywordsFile)) {
    throw new Error(`Keyword file does not exist: ${options.keywordsFile}`);
  }
  if (options.workspacePath && !existsSync(options.workspacePath)) {
    throw new Error(`Workspace does not exist: ${options.workspacePath}`);
  }
  return options;
}

function mergeKeywords(...groups) {
  const byValue = new Map();
  const ids = new Set();
  for (const keyword of normalizeKeywords(groups.flat())) {
    const valueKey = keyword.value.toLocaleLowerCase();
    if (byValue.has(valueKey)) continue;
    let id = keyword.id;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${keyword.id}:${suffix}`;
      suffix += 1;
    }
    ids.add(id);
    byValue.set(valueKey, {
      id,
      value: keyword.value,
      match: keyword.match,
    });
  }
  return [...byValue.values()];
}

function printHumanReport(report) {
  console.log(`Scope: ${report.scope}`);
  console.log(`Organizations: ${report.organizations.join(", ")}`);
  console.log(`Target organizations: ${report.targetOrganizations.join(", ")}`);
  console.log(`Local public repositories scanned: ${report.metrics.localPublicRepositoriesScanned}`);
  console.log(`Local private repositories scanned: ${report.metrics.localPrivateRepositoriesScanned}`);
  console.log(`Private findings ignored: ${report.metrics.privateFindingsIgnored}`);
  console.log(
    `Public repositories missing locally: ${report.metrics.publicRepositoriesMissingLocally}`,
  );
  console.log(`Keyword labels checked: ${report.metrics.keywordLabelsChecked}`);
  if (report.findings.length === 0) {
    console.log("CLEAN: no public private-reference findings.");
  } else {
    console.error(`FOUND: ${report.findings.length} public private-reference finding(s).`);
    for (const finding of report.findings.slice(0, HUMAN_FINDING_LIMIT)) {
      if (finding.surface === "metadata") {
        console.error(
          `  ${finding.repository} metadata:${finding.field} [${finding.keywordIds.join(", ")}]`,
        );
      } else {
        console.error(
          `  ${finding.repository}/${finding.path}:${finding.line} [${finding.keywordIds.join(", ")}]`,
        );
      }
    }
    if (report.findings.length > HUMAN_FINDING_LIMIT) {
      console.error(
        `  ... ${report.findings.length - HUMAN_FINDING_LIMIT} more; see the local JSON report.`,
      );
    }
  }

  for (const error of report.errors) {
    console.error(`INCOMPLETE: ${error.stage}: ${error.message}`);
  }
}

export function classifyRepositoryFindings(repository, repositoryFindings, keywords = []) {
  if (repository.visibility !== "public") {
    return {
      publicFindings: [],
      privateFindingsIgnored: repositoryFindings.length,
    };
  }
  return {
    publicFindings: repositoryFindings.map((finding) => ({
      repository: redactKeywordValues(repository.nameWithOwner, keywords),
      surface: "local-tracked-files",
      path: redactKeywordValues(finding.file, keywords),
      line: finding.line,
      keywordIds: finding.keywordIds,
    })),
    privateFindingsIgnored: 0,
  };
}

export function repositoryAuditReference(repository, keywords = []) {
  return repository.visibility === "public"
    ? redactKeywordValues(repository.nameWithOwner, keywords)
    : redactedRepositoryLabel(repository.nameWithOwner);
}

export function createRepositoryAuditError(stage, repository, error, keywords = []) {
  const isPublic = repository.visibility === "public";
  return {
    stage,
    repository: repositoryAuditReference(repository, keywords),
    message: isPublic
      ? redactKeywordValues(
        error instanceof Error ? error.message : String(error),
        keywords,
      )
      : "Repository details suppressed because visibility is not confirmed public.",
  };
}

export function runAudit(options) {
  const inventories = [];
  for (const organization of options.organizations) {
    if (options.verbose) console.error(`[inventory] ${organization}`);
    inventories.push(...listOrganizationRepositories(organization));
  }

  const repositoriesByName = new Map();
  for (const repository of inventories) {
    repositoriesByName.set(repository.nameWithOwner.toLocaleLowerCase(), repository);
  }
  const repositories = [...repositoriesByName.values()];
  const targetOrganizations = new Set(
    options.targetOrganizations.map((organization) => organization.toLocaleLowerCase()),
  );
  const targetRepositories = repositories
    .filter((repository) => {
      const [owner] = repository.nameWithOwner.split("/");
      return targetOrganizations.has(owner.toLocaleLowerCase());
    })
    .sort((left, right) => left.nameWithOwner.localeCompare(right.nameWithOwner));
  const publicRepositories = targetRepositories.filter(
    (repository) => repository.visibility === "public",
  );

  const localConfig = options.keywordsFile
    ? loadKeywordConfig(options.keywordsFile)
    : { keywords: [], ignorePatterns: [] };
  const keywords = mergeKeywords(
    localConfig.keywords,
    derivePrivateRepositoryKeywords(repositories),
  );
  if (keywords.length === 0) {
    throw new Error("No keywords available from the local config or private repository inventory.");
  }

  const findings = scanPublicRepositoryMetadata(publicRepositories, keywords);
  const errors = [];
  const workspaceRepositories = listWorkspaceRepositories(options.workspacePath);
  const inventoryNames = new Set(
    repositories.map(({ nameWithOwner }) => nameWithOwner.toLocaleLowerCase()),
  );
  for (const workspaceRepository of workspaceRepositories) {
    const nameKey = workspaceRepository.nameWithOwner.toLocaleLowerCase();
    const [owner] = workspaceRepository.nameWithOwner.split("/");
    if (
      inventoryNames.has(nameKey)
      || !targetOrganizations.has(owner.toLocaleLowerCase())
    ) {
      continue;
    }
    try {
      const resolvedRepository = viewRepository(workspaceRepository.nameWithOwner);
      const resolvedKey = resolvedRepository.nameWithOwner.toLocaleLowerCase();
      if (!inventoryNames.has(resolvedKey)) {
        throw new Error(
          `Resolved repository is absent from the authenticated inventory: `
          + resolvedRepository.nameWithOwner,
        );
      }
      workspaceRepository.nameWithOwner = resolvedRepository.nameWithOwner;
    } catch (error) {
      errors.push(createRepositoryAuditError(
        "visibility",
        {
          nameWithOwner: workspaceRepository.nameWithOwner,
          visibility: "unknown",
        },
        error,
        keywords,
      ));
    }
  }
  const workspaceRepositoryNames = new Set(
    workspaceRepositories.map(({ nameWithOwner }) => nameWithOwner.toLocaleLowerCase()),
  );
  let localPublicRepositoriesScanned = 0;
  let localPrivateRepositoriesScanned = 0;
  let privateFindingsIgnored = 0;

  for (const repository of targetRepositories) {
    const workspaceRepository = chooseWorkspaceRepository(repository, workspaceRepositories);
    if (!workspaceRepository) continue;
    if (options.verbose) {
      console.error(
        `[scan] ${repositoryAuditReference(repository, keywords)} (${repository.visibility})`,
      );
    }

    try {
      const trackedFiles = listTrackedFiles(workspaceRepository.path);
      const repositoryFindings = scanDirectory(workspaceRepository.path, keywords, {
        ignorePatterns: localConfig.ignorePatterns,
        relativeFiles: trackedFiles,
        strict: true,
      });
      const classifiedFindings = classifyRepositoryFindings(
        repository,
        repositoryFindings,
        keywords,
      );
      if (repository.visibility === "public") {
        findings.push(...classifiedFindings.publicFindings);
        localPublicRepositoriesScanned += 1;
      } else {
        privateFindingsIgnored += classifiedFindings.privateFindingsIgnored;
        localPrivateRepositoriesScanned += 1;
      }
    } catch (error) {
      errors.push(createRepositoryAuditError("local-scan", repository, error, keywords));
    }
  }

  const publicRepositoriesMissingLocally = publicRepositories.filter(
    (repository) => !workspaceRepositoryNames.has(repository.nameWithOwner.toLocaleLowerCase()),
  );
  const unclassifiedLocalRepositories = workspaceRepositories
    .filter(({ nameWithOwner }) => {
      const [owner] = nameWithOwner.split("/");
      return targetOrganizations.has(owner.toLocaleLowerCase())
        && !inventoryNames.has(nameWithOwner.toLocaleLowerCase());
    })
    .map(({ nameWithOwner }) => nameWithOwner);
  const visibilityErrorRepositories = new Set(
    errors
      .filter(({ stage }) => stage === "visibility")
      .map(({ repository }) => repository.toLocaleLowerCase()),
  );
  for (const repository of unclassifiedLocalRepositories) {
    const repositoryRecord = {
      nameWithOwner: repository,
      visibility: "unknown",
    };
    const reference = repositoryAuditReference(repositoryRecord, keywords);
    if (visibilityErrorRepositories.has(reference.toLocaleLowerCase())) continue;
    errors.push(createRepositoryAuditError(
      "visibility",
      repositoryRecord,
      new Error("Local repository is absent from the authenticated GitHub inventory."),
      keywords,
    ));
  }

  return {
    script: "github-public-leak-audit",
    gate: true,
    scope: "public metadata and Git-tracked files in existing local workspace repositories",
    organizations: options.organizations.map(
      (organization) => redactKeywordValues(organization, keywords),
    ),
    targetOrganizations: options.targetOrganizations.map(
      (organization) => redactKeywordValues(organization, keywords),
    ),
    findings,
    errors,
    skipped: {
      publicRepositoriesMissingLocally: publicRepositoriesMissingLocally.map(
        ({ nameWithOwner }) => redactKeywordValues(nameWithOwner, keywords),
      ),
    },
    metrics: {
      localPublicRepositoriesScanned,
      localPrivateRepositoriesScanned,
      privateFindingsIgnored,
      publicRepositoriesMissingLocally: publicRepositoriesMissingLocally.length,
      unclassifiedLocalRepositories: unclassifiedLocalRepositories.length,
      keywordLabelsChecked: keywords.length,
    },
  };
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
      return;
    }

    const report = runAudit(options);
    if (options.outputPath) {
      writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHumanReport(report);
    process.exitCode = report.errors.length > 0
      ? 2
      : report.findings.length > 0
        ? 1
        : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`github-public-leak-audit: ${message}`);
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
