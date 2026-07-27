import {
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  isAbsolute,
  join,
} from "node:path";
import { pathToFileURL } from "node:url";

import { runCommand } from "./command-runner.mjs";
import { rewriteHistoryRef } from "./history-rewriter.mjs";

function git(repositoryPath, args, options = {}) {
  return runCommand("git", args, {
    cwd: repositoryPath,
    ...options,
  });
}

function temporaryBareRepository() {
  const path = mkdtempSync(join(tmpdir(), "aiformat-history-reset-"));
  git(path, ["init", "--bare"]);
  return path;
}

function gitTransportUrl(remoteUrl) {
  return isAbsolute(remoteUrl) ? pathToFileURL(remoteUrl).href : remoteUrl;
}

export function assertCleanWorktree(repositoryPath) {
  const status = git(repositoryPath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    throw new Error("Local repository must be clean before preparing rewritten history.");
  }
}

export function prepareCleanHistory(
  repositoryPath,
  {
    sourceRef = "HEAD",
    branch,
    bundlePath,
    keywords,
    remote = "origin",
  },
) {
  assertCleanWorktree(repositoryPath);
  if (existsSync(bundlePath)) {
    throw new Error("External history bundle already exists; refusing to overwrite it.");
  }
  const remoteUrl = gitTransportUrl(
    git(repositoryPath, ["remote", "get-url", remote]),
  );
  const existing = git(
    repositoryPath,
    ["ls-remote", "--heads", remoteUrl, `refs/heads/${branch}`],
  );
  if (existing) {
    throw new Error("Clean history branch already exists; refusing to overwrite it.");
  }

  const temporaryRepository = temporaryBareRepository();
  try {
    git(temporaryRepository, [
      "fetch",
      repositoryPath,
      `${sourceRef}:refs/heads/source`,
    ]);
    const rewritten = rewriteHistoryRef({
      gitDirectory: temporaryRepository,
      sourceRef: "refs/heads/source",
      targetRef: "refs/heads/cleaned",
      keywords,
    });
    const sourceCount = Number(
      git(temporaryRepository, ["rev-list", "--count", "refs/heads/source"]),
    );
    const cleanedCount = Number(
      git(temporaryRepository, ["rev-list", "--count", "refs/heads/cleaned"]),
    );
    if (sourceCount !== cleanedCount || cleanedCount !== rewritten.commitCount) {
      throw new Error("Rewritten history did not preserve the source commit count.");
    }

    git(temporaryRepository, [
      "bundle",
      "create",
      bundlePath,
      "refs/heads/cleaned",
    ]);
    git(
      temporaryRepository,
      [
        "push",
        remoteUrl,
        `refs/heads/cleaned:refs/heads/${branch}`,
      ],
      { timeoutMs: 300_000 },
    );
    const remoteCommit = git(
      temporaryRepository,
      ["ls-remote", "--heads", remoteUrl, `refs/heads/${branch}`],
    ).split(/\s+/)[0];
    if (remoteCommit !== rewritten.rewrittenTip) {
      throw new Error("Remote clean history branch does not match the rewritten tip.");
    }

    return {
      bundlePath,
      commit: rewritten.rewrittenTip,
      commitCount: rewritten.commitCount,
      rewrittenBlobCount: rewritten.rewrittenBlobCount,
    };
  } finally {
    rmSync(temporaryRepository, { recursive: true, force: true });
  }
}

export function pushNewMain(
  _repositoryPath,
  {
    bundlePath,
    commit,
    repositoryUrl,
  },
) {
  const temporaryRepository = temporaryBareRepository();
  try {
    git(temporaryRepository, [
      "fetch",
      bundlePath,
      "refs/heads/cleaned:refs/heads/cleaned",
    ]);
    const bundledCommit = git(
      temporaryRepository,
      ["rev-parse", "refs/heads/cleaned"],
    );
    if (bundledCommit !== commit) {
      throw new Error("External history bundle does not match the saved clean tip.");
    }
    git(
      temporaryRepository,
      [
        "push",
        repositoryUrl,
        "refs/heads/cleaned:refs/heads/main",
      ],
      { timeoutMs: 300_000 },
    );
    const remoteCommit = git(
      temporaryRepository,
      ["ls-remote", "--heads", repositoryUrl, "refs/heads/main"],
    ).split(/\s+/)[0];
    if (remoteCommit !== commit) {
      throw new Error("Replacement main does not match the rewritten history tip.");
    }
  } finally {
    rmSync(temporaryRepository, { recursive: true, force: true });
  }
}
