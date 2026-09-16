import { readGitHubRepository } from "./github-lifecycle.mjs";
import { runCommand } from "./command-runner.mjs";

export function assertPreparedState(repository, state) {
  if (state.repository !== repository.nameWithOwner
    || state.cleanBranch !== repository.cleanBranch
    || state.historyPolicy !== "preserve-rewritten-commit-graph"
    || !/^[0-9a-f]{40}$/.test(state.cleanHistoryTip ?? "")
    || !Number.isSafeInteger(state.originalRepositoryId) || state.originalRepositoryId <= 0) {
    throw new Error("Reset state does not match the selected repository.");
  }
}

/** Pin both identities: a renamed URL or a newly reused name is not evidence of identity. */
export function assertMigrationRepositories(repository, state, replacementId, replacement, archive) {
  assertPreparedState(repository, state);
  if (!Number.isSafeInteger(replacementId) || replacementId <= 0
    || replacementId === state.originalRepositoryId
    || (state.replacementRepositoryId && state.replacementRepositoryId !== replacementId)
    || replacement?.id !== replacementId || archive?.id !== state.originalRepositoryId
    || replacement.full_name !== repository.nameWithOwner
    || archive.full_name !== `${repository.organization}/${repository.archiveName}`
    || replacement.visibility !== repository.newVisibility || replacement.archived !== false
    || archive.visibility !== "private" || archive.archived !== true) {
    throw new Error("Replacement/archive identity or visibility does not match the migration.");
  }
}

export function observeMigration(repository, state, replacementId, commandRunner = runCommand) {
  const replacement = readGitHubRepository(repository.nameWithOwner, commandRunner);
  const archive = readGitHubRepository(`${repository.organization}/${repository.archiveName}`, commandRunner);
  assertMigrationRepositories(repository, state, replacementId, replacement, archive);
  const output = commandRunner("git", ["ls-remote", "--refs",
    `https://github.com/${repository.nameWithOwner}.git`], { cwd: repository.localPath });
  const refs = output.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const match = /^([0-9a-f]{40})\s+(refs\/\S+)$/.exec(line);
    if (!match) throw new Error("Cannot parse remote refs; refusing migration verification.");
    return { sha: match[1], ref: match[2] };
  });
  return { replacement, archive, refs };
}

export function assertPublishedMain(observation, tip) {
  if (observation.replacement.default_branch !== "main" || observation.refs.length !== 1
    || observation.refs[0].ref !== "refs/heads/main" || observation.refs[0].sha !== tip) {
    throw new Error("Replacement must contain only the expected main; migration is not verified.");
  }
}
