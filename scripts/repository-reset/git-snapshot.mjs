import { runCommand } from "./command-runner.mjs";

function git(repositoryPath, args, options = {}) {
  return runCommand("git", args, {
    cwd: repositoryPath,
    ...options,
  });
}

export function assertCleanWorktree(repositoryPath) {
  const status = git(repositoryPath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    throw new Error("Local repository must be clean before preparing a reset snapshot.");
  }
}

export function createRootCommit(
  repositoryPath,
  {
    sourceRef = "HEAD",
    message = "chore: initialize clean repository snapshot",
  } = {},
) {
  assertCleanWorktree(repositoryPath);
  const tree = git(repositoryPath, ["rev-parse", `${sourceRef}^{tree}`]);
  const commit = git(repositoryPath, ["commit-tree", tree, "-m", message]);
  const parents = git(repositoryPath, ["rev-list", "--parents", "-n", "1", commit])
    .split(/\s+/);
  if (parents.length !== 1) {
    throw new Error("Prepared snapshot must be a parentless root commit.");
  }
  return { commit, tree };
}

export function pushCleanBranch(
  repositoryPath,
  {
    commit,
    branch,
    remote = "origin",
  },
) {
  const existing = git(
    repositoryPath,
    ["ls-remote", "--heads", remote, `refs/heads/${branch}`],
  );
  if (existing) {
    throw new Error("Clean backup branch already exists; refusing to overwrite it.");
  }
  git(
    repositoryPath,
    ["push", remote, `${commit}:refs/heads/${branch}`],
    { timeoutMs: 300_000 },
  );
  const remoteCommit = git(
    repositoryPath,
    ["ls-remote", "--heads", remote, `refs/heads/${branch}`],
  ).split(/\s+/)[0];
  if (remoteCommit !== commit) {
    throw new Error("Remote clean branch does not match the prepared root commit.");
  }
}

export function pushNewMain(repositoryPath, { commit, repositoryUrl }) {
  git(
    repositoryPath,
    ["push", repositoryUrl, `${commit}:refs/heads/main`],
    { timeoutMs: 300_000 },
  );
  const remoteCommit = git(
    repositoryPath,
    ["ls-remote", "--heads", repositoryUrl, "refs/heads/main"],
  ).split(/\s+/)[0];
  if (remoteCommit !== commit) {
    throw new Error("Replacement main does not match the prepared root commit.");
  }
}
