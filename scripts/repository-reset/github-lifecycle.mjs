import { runCommand } from "./command-runner.mjs";

function ghJson(args, commandRunner = runCommand) {
  const output = commandRunner("gh", args, { timeoutMs: 120_000 });
  return output ? JSON.parse(output) : null;
}

export function readGitHubRepository(nameWithOwner, commandRunner = runCommand) {
  return ghJson(["api", `repos/${nameWithOwner}`], commandRunner);
}

export function buildResetPlan(repository) {
  return {
    repository: repository.nameWithOwner,
    cleanBranch: repository.cleanBranch,
    archiveRepository: `${repository.organization}/${repository.archiveName}`,
    archiveVisibility: repository.archiveVisibility,
    newRepository: repository.nameWithOwner,
    newVisibility: repository.newVisibility,
    newDefaultBranch: "main",
    historyPolicy: "single-parentless-root-commit",
    forcePush: false,
  };
}

export function migrateGitHubRepository(
  repository,
  {
    rootCommit,
    pushMain,
    commandRunner = runCommand,
  },
) {
  const original = readGitHubRepository(repository.nameWithOwner, commandRunner);
  if (!original?.id) {
    throw new Error("Cannot resolve the original GitHub repository.");
  }

  ghJson([
    "api",
    "--method",
    "PATCH",
    `repos/${repository.nameWithOwner}`,
    "-f",
    `name=${repository.archiveName}`,
  ], commandRunner);

  const created = ghJson([
    "api",
    "--method",
    "POST",
    `orgs/${repository.organization}/repos`,
    "-f",
    `name=${repository.name}`,
    "-f",
    `visibility=${repository.newVisibility}`,
    "-f",
    `description=${original.description ?? ""}`,
  ], commandRunner);
  if (!created?.id || created.id === original.id) {
    throw new Error("GitHub did not create a distinct replacement repository.");
  }

  const repositoryUrl = `https://github.com/${repository.nameWithOwner}.git`;
  pushMain(repository.localPath, { commit: rootCommit, repositoryUrl });

  ghJson([
    "api",
    "--method",
    "PATCH",
    `repos/${repository.nameWithOwner}`,
    "-f",
    "default_branch=main",
  ], commandRunner);
  ghJson([
    "api",
    "--method",
    "PATCH",
    `repos/${repository.organization}/${repository.archiveName}`,
    "-f",
    "visibility=private",
  ], commandRunner);
  ghJson([
    "api",
    "--method",
    "PATCH",
    `repos/${repository.organization}/${repository.archiveName}`,
    "-F",
    "archived=true",
  ], commandRunner);

  const replacement = readGitHubRepository(repository.nameWithOwner, commandRunner);
  const archive = readGitHubRepository(
    `${repository.organization}/${repository.archiveName}`,
    commandRunner,
  );
  if (
    replacement?.id !== created.id
    || replacement.default_branch !== "main"
    || archive?.visibility?.toLocaleLowerCase() !== "private"
    || archive.archived !== true
  ) {
    throw new Error("Post-migration GitHub verification failed.");
  }

  return {
    originalRepositoryId: original.id,
    replacementRepositoryId: replacement.id,
    archiveRepositoryId: archive.id,
    rootCommit,
  };
}
