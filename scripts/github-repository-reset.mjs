#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import {
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  listTrackedFiles,
} from "./leak-checker/github-repositories.mjs";
import { loadKeywordConfig } from "./leak-checker/keyword-config.mjs";
import { scanDirectory } from "./leak-checker/scanner.mjs";
import {
  buildResetPlan,
  finalizeGitHubRepository,
  migrateGitHubRepository,
  readGitHubRepository,
} from "./repository-reset/github-lifecycle.mjs";
import {
  createRootCommit,
  pushCleanBranch,
  pushNewMain,
} from "./repository-reset/git-snapshot.mjs";
import { loadResetManifest } from "./repository-reset/manifest.mjs";

const USAGE = `Usage:
  node scripts/github-repository-reset.mjs plan --manifest <external.json>
  node scripts/github-repository-reset.mjs prepare --manifest <external.json>
    --repository <owner/name> --keywords-file <external.json> --state <external.json> --apply
  node scripts/github-repository-reset.mjs migrate --manifest <external.json>
    --repository <owner/name> --state <external.json> --confirm <owner/name> --apply
  node scripts/github-repository-reset.mjs resume --manifest <external.json>
    --repository <owner/name> --state <external.json> --confirm <owner/name> --apply

The manifest, keyword file, state, and generated audit reports must stay outside
the repository. prepare creates a parentless root commit and pushes it to a new
clean branch without force. migrate renames the old repository, creates a new
repository under the original name, pushes only the root commit to main, then
makes the renamed backup private and archived.`;

function parseArguments(args) {
  const [command, ...rest] = args;
  const options = { command, apply: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    options[argument.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  if (!["plan", "prepare", "migrate", "resume"].includes(command)) {
    throw new Error(USAGE);
  }
  if (!options.manifest) throw new Error("--manifest is required.");
  return options;
}

function selectRepository(manifest, nameWithOwner) {
  const repository = manifest.repositories.find(
    (candidate) =>
      candidate.nameWithOwner.toLocaleLowerCase() === nameWithOwner?.toLocaleLowerCase(),
  );
  if (!repository) {
    throw new Error("Requested repository is absent from the reset manifest.");
  }
  return repository;
}

function assertExternalPath(path, repositoryPath, field) {
  if (!path) throw new Error(`${field} is required.`);
  const target = resolve(path);
  const repository = resolve(repositoryPath);
  const pathFromRepository = relative(repository, target);
  if (
    pathFromRepository === ""
    || (!pathFromRepository.startsWith("..") && !isAbsolute(pathFromRepository))
  ) {
    throw new Error(`${field} must be outside the repository.`);
  }
  return target;
}

function assertCleanSnapshot(repository, keywordsFile) {
  const config = loadKeywordConfig(keywordsFile);
  const trackedFiles = listTrackedFiles(repository.localPath);
  const findings = scanDirectory(repository.localPath, config.keywords, {
    ignorePatterns: config.ignorePatterns,
    relativeFiles: trackedFiles,
    strict: true,
  });
  if (findings.length > 0) {
    throw new Error(
      `Snapshot contains ${findings.length} forbidden reference(s); preparation stopped.`,
    );
  }
}

export function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const manifest = loadResetManifest(resolve(options.manifest));

  if (options.command === "plan") {
    console.log(JSON.stringify(manifest.repositories.map(buildResetPlan), null, 2));
    return;
  }

  if (!options.repository) throw new Error("--repository is required.");
  const repository = selectRepository(manifest, options.repository);
  const statePath = assertExternalPath(options.state, repository.localPath, "--state");

  if (options.command === "prepare") {
    if (!options.apply) throw new Error("prepare requires --apply.");
    if (!options.keywords_file) throw new Error("prepare requires --keywords-file.");
    const keywordsFile = assertExternalPath(
      options.keywords_file,
      repository.localPath,
      "--keywords-file",
    );
    assertCleanSnapshot(repository, keywordsFile);
    const original = readGitHubRepository(repository.nameWithOwner);
    const snapshot = createRootCommit(repository.localPath);
    pushCleanBranch(repository.localPath, {
      commit: snapshot.commit,
      branch: repository.cleanBranch,
    });
    writeFileSync(statePath, `${JSON.stringify({
      version: 1,
      repository: repository.nameWithOwner,
      originalRepositoryId: original.id,
      rootCommit: snapshot.commit,
      cleanBranch: repository.cleanBranch,
    }, null, 2)}\n`, "utf8");
    console.log(`Prepared ${repository.nameWithOwner} at ${snapshot.commit}.`);
    return;
  }

  if (!options.apply || options.confirm !== repository.nameWithOwner) {
    throw new Error("migrate requires --apply and exact --confirm <owner/name>.");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (
    state.repository !== repository.nameWithOwner
    || state.cleanBranch !== repository.cleanBranch
    || !/^[0-9a-f]{40}$/i.test(state.rootCommit)
  ) {
    throw new Error("Reset state does not match the selected repository.");
  }
  const result = options.command === "resume"
    ? finalizeGitHubRepository(repository, {
      rootCommit: state.rootCommit,
      originalRepositoryId: state.originalRepositoryId,
      replacementRepositoryId: readGitHubRepository(repository.nameWithOwner).id,
      pushMain: pushNewMain,
    })
    : migrateGitHubRepository(repository, {
      rootCommit: state.rootCommit,
      pushMain: pushNewMain,
    });
  writeFileSync(statePath, `${JSON.stringify({
    ...state,
    migrated: true,
    ...result,
  }, null, 2)}\n`, "utf8");
  console.log(`Migrated ${repository.nameWithOwner} without force push.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`github-repository-reset: ${error.message}`);
    process.exitCode = 1;
  }
}
