import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertCleanWorktree,
  prepareCleanHistory,
} from "./git-snapshot.mjs";

function git(repositoryPath, ...args) {
  const result = spawnSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("rewrites configured values while preserving commit count", () => {
  const root = mkdtempSync(join(tmpdir(), "aiformat-reset-history-"));
  const repositoryPath = join(root, "repository");
  const remotePath = join(root, "remote.git");
  const bundlePath = join(root, "clean-history.bundle");
  try {
    mkdirSync(repositoryPath);
    mkdirSync(remotePath);
    git(repositoryPath, "init");
    git(repositoryPath, "checkout", "-b", "main");
    git(repositoryPath, "config", "user.name", "Reset Test");
    git(repositoryPath, "config", "user.email", "reset@example.invalid");
    writeFileSync(join(repositoryPath, "README.md"), "private-value v1\n");
    git(repositoryPath, "add", "README.md");
    git(repositoryPath, "commit", "-m", "initial");
    writeFileSync(join(repositoryPath, "README.md"), "private-value v2\n");
    git(repositoryPath, "add", "README.md");
    git(repositoryPath, "commit", "-m", "update private-value");
    git(remotePath, "init", "--bare");
    git(repositoryPath, "remote", "add", "origin", remotePath);

    const prepared = prepareCleanHistory(repositoryPath, {
      branch: "clean/history",
      bundlePath,
      keywords: [{
        id: "term-1",
        value: "private-value",
        match: "substring",
      }],
    });

    assert.equal(prepared.commitCount, 2);
    assert.equal(existsSync(bundlePath), true);
    assert.equal(
      git(remotePath, "rev-list", "--count", "refs/heads/clean/history"),
      "2",
    );
    assert.equal(
      git(remotePath, "log", "-p", "--format=", "refs/heads/clean/history")
        .includes("private-value"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses to prepare rewritten history from a dirty worktree", () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "aiformat-reset-dirty-"));
  try {
    git(repositoryPath, "init");
    writeFileSync(join(repositoryPath, "untracked.txt"), "dirty\n");
    assert.throws(() => assertCleanWorktree(repositoryPath), /must be clean/i);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});
