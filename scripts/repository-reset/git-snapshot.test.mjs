import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertCleanWorktree,
  createRootCommit,
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

test("creates a parentless commit from a clean source tree", () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "aiformat-reset-root-"));
  try {
    git(repositoryPath, "init");
    git(repositoryPath, "checkout", "-b", "main");
    git(repositoryPath, "config", "user.name", "Reset Test");
    git(repositoryPath, "config", "user.email", "reset@example.invalid");
    writeFileSync(join(repositoryPath, "README.md"), "clean snapshot\n");
    git(repositoryPath, "add", "README.md");
    git(repositoryPath, "commit", "-m", "initial");
    writeFileSync(join(repositoryPath, "README.md"), "clean snapshot v2\n");
    git(repositoryPath, "add", "README.md");
    git(repositoryPath, "commit", "-m", "update");

    const snapshot = createRootCommit(repositoryPath);
    const rootLine = git(
      repositoryPath,
      "rev-list",
      "--parents",
      "-n",
      "1",
      snapshot.commit,
    );

    assert.equal(rootLine.split(/\s+/).length, 1);
    assert.equal(
      git(repositoryPath, "rev-parse", `${snapshot.commit}^{tree}`),
      git(repositoryPath, "rev-parse", "HEAD^{tree}"),
    );
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("refuses to prepare a snapshot from a dirty worktree", () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "aiformat-reset-dirty-"));
  try {
    git(repositoryPath, "init");
    git(repositoryPath, "checkout", "-b", "main");
    writeFileSync(join(repositoryPath, "untracked.txt"), "dirty\n");
    assert.throws(() => assertCleanWorktree(repositoryPath), /must be clean/i);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});
