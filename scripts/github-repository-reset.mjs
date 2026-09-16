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
  prepareCleanHistory,
  pushNewMain,
} from "./repository-reset/git-snapshot.mjs";
import { loadResetManifest } from "./repository-reset/manifest.mjs";
import { createPublicationHandoff, requireExternalFile, verifyPublication } from "./repository-reset/publication-handoff.mjs";

const USAGE = `Usage:
  node scripts/github-repository-reset.mjs plan --manifest <external.json>
  node scripts/github-repository-reset.mjs prepare --manifest <external.json>
    --repository <owner/name> --keywords-file <external.json> --state <external.json> [--bundle-only] --apply
  node scripts/github-repository-reset.mjs handoff --manifest <external.json>
    --repository <owner/name> --state <external.json> --publication-cwd <checkout-root>
    --replacement-id <GitHub-id> --handoff <new-external.json> --reason <text> --apply
  node scripts/github-repository-reset.mjs verify --manifest <external.json>
    --repository <owner/name> --state <external.json> --replacement-id <GitHub-id>
    --handoff <existing-external.json> [--apply]
  node scripts/github-repository-reset.mjs migrate --manifest <external.json>
    --repository <owner/name> --state <external.json> --confirm <owner/name> --apply
  node scripts/github-repository-reset.mjs resume --manifest <external.json>
    --repository <owner/name> --state <external.json> --confirm <owner/name> --apply

Cc/Revisor sessions: use prepare --bundle-only, archive/recreate as documented,
then handoff -> revisor push --handoff (fresh Cc WARNING) -> verify --apply.
handoff creates a local operation document; it does not approve or publish it.
verify reads GitHub and writes completion state only with --apply.
See spec/feature/repository-reset-handoff.md for the complete operator sequence.

The manifest, keyword file, state, and generated audit reports must stay outside
the repository. prepare rewrites only configured values while preserving the
source commit graph and stores an external bundle. Without --bundle-only it also
pushes to a new clean branch without force. Legacy migrate renames the old repository, creates
a new repository under the original name, pushes the bundle to main, then makes
the renamed backup private and archived.`;

function parseArguments(args) {
  const [command, ...rest] = args;
  const options = { command, apply: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--apply" || argument === "--bundle-only") {
      options[argument === "--apply" ? "apply" : "bundle_only"] = true;
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
  if (!["plan", "prepare", "migrate", "resume", "handoff", "verify"].includes(command)) {
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
  return config;
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

  if (process.env.LICTOR_PORT || process.env.CONCORDIA_SESSION_HOOK_RUNNER) {
    if (["migrate", "resume"].includes(options.command)) {
      throw new Error("Cc/Revisor sessions must use the archive/recreate runbook, handoff and verify; direct migration push is not supported.");
    }
    if (options.command === "prepare" && !options.bundle_only) {
      throw new Error("Cc/Revisor preparation requires --bundle-only; publication belongs to Revisor.");
    }
  }

  if (["handoff", "verify"].includes(options.command)) {
    const state = JSON.parse(readFileSync(statePath, "utf8").replace(/^\uFEFF/, ""));
    const handoffPath = requireExternalFile(options.handoff, [repository.localPath,
      ...(options.publication_cwd ? [options.publication_cwd] : [])]);
    if (handoffPath === resolve(statePath) || handoffPath === resolve(options.manifest)) {
      throw new Error("Handoff must differ from the state and manifest paths.");
    }
    const replacementId = Number(options.replacement_id);
    if (options.command === "handoff") {
      if (!options.apply) throw new Error("handoff requires --apply to create its local file.");
      requireExternalFile(statePath, [options.publication_cwd || repository.localPath]);
      process.stdout.write(`${JSON.stringify(createPublicationHandoff(repository, state, {
        path: handoffPath, cwd: options.publication_cwd, replacementId, reason: options.reason,
      }), null, 2)}\n`);
    } else {
      const result = verifyPublication(repository, state, { path: handoffPath, replacementId });
      if (options.apply) writeFileSync(statePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify({ verified: true, stateWritten: options.apply,
        repository: result.repository, cleanHistoryTip: result.cleanHistoryTip,
        localSynchronizationRequired: true }, null, 2)}\n`);
    }
    return;
  }

  if (options.command === "prepare") {
    if (!options.apply) throw new Error("prepare requires --apply.");
    if (!options.keywords_file) throw new Error("prepare requires --keywords-file.");
    const keywordsFile = assertExternalPath(
      options.keywords_file,
      repository.localPath,
      "--keywords-file",
    );
    const config = assertCleanSnapshot(repository, keywordsFile);
    const original = readGitHubRepository(repository.nameWithOwner);
    const bundlePath = `${statePath}.bundle`;
    const history = prepareCleanHistory(repository.localPath, {
      branch: repository.cleanBranch,
      bundlePath,
      keywords: config.keywords,
      publishCleanBranch: !options.bundle_only,
    });
    writeFileSync(statePath, `${JSON.stringify({
      version: 1,
      repository: repository.nameWithOwner,
      originalRepositoryId: original.id,
      cleanHistoryTip: history.commit,
      sourceHistoryTip: history.sourceTip,
      commitCount: history.commitCount,
      rewrittenBlobCount: history.rewrittenBlobCount,
      bundlePath,
      cleanBranch: repository.cleanBranch,
      historyPolicy: "preserve-rewritten-commit-graph",
    }, null, 2)}\n`, "utf8");
    console.log(
      `Prepared ${repository.nameWithOwner} at ${history.commit} `
      + `(${history.commitCount} commits preserved).`,
    );
    return;
  }

  if (!options.apply || options.confirm !== repository.nameWithOwner) {
    throw new Error("migrate requires --apply and exact --confirm <owner/name>.");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const bundlePath = assertExternalPath(
    state.bundlePath,
    repository.localPath,
    "saved bundle path",
  );
  if (
    state.repository !== repository.nameWithOwner
    || state.cleanBranch !== repository.cleanBranch
    || state.historyPolicy !== "preserve-rewritten-commit-graph"
    || !/^[0-9a-f]{40}$/i.test(state.cleanHistoryTip)
  ) {
    throw new Error("Reset state does not match the selected repository.");
  }
  const result = options.command === "resume"
    ? finalizeGitHubRepository(repository, {
      historyTip: state.cleanHistoryTip,
      historyBundlePath: bundlePath,
      originalRepositoryId: state.originalRepositoryId,
      replacementRepositoryId: readGitHubRepository(repository.nameWithOwner).id,
      pushMain: pushNewMain,
    })
    : migrateGitHubRepository(repository, {
      historyTip: state.cleanHistoryTip,
      historyBundlePath: bundlePath,
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
