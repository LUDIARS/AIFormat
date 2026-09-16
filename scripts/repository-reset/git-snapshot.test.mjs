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

function repositoryWithRemote(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repositoryPath = join(root, "repository");
  const remotePath = join(root, "remote.git");
  mkdirSync(repositoryPath);
  mkdirSync(remotePath);
  git(repositoryPath, "init");
  git(repositoryPath, "checkout", "-b", "main");
  git(repositoryPath, "config", "user.name", "Reset Test");
  git(repositoryPath, "config", "user.email", "reset@example.invalid");
  git(remotePath, "init", "--bare");
  git(repositoryPath, "remote", "add", "origin", remotePath);
  return { root, repositoryPath, remotePath, bundlePath: join(root, "clean-history.bundle") };
}

test("bundle-only preparation does not publish any remote ref", () => {
  const fixture = repositoryWithRemote("aiformat-reset-bundle-only-");
  try {
    writeFileSync(join(fixture.repositoryPath, "README.md"), "private-value\n");
    git(fixture.repositoryPath, "add", "README.md");
    git(fixture.repositoryPath, "commit", "-m", "initial private-value");
    const source = git(fixture.repositoryPath, "rev-parse", "HEAD");
    const prepared = prepareCleanHistory(fixture.repositoryPath, {
      branch: "clean/history", bundlePath: fixture.bundlePath, publishCleanBranch: false,
      keywords: [{ id: "term-1", value: "private-value", match: "substring" }],
    });
    assert.equal(prepared.sourceTip, source);
    assert.notEqual(prepared.commit, source);
    assert.equal(git(fixture.remotePath, "for-each-ref", "--format=%(refname)"), "");
    assert.equal(git(fixture.repositoryPath, "bundle", "list-heads", fixture.bundlePath),
      `${prepared.commit} refs/heads/cleaned`);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("rewrites configured values in file and directory names with filesystem-safe segments", () => {
  const fixture = repositoryWithRemote("aiformat-reset-paths-");
  try {
    const { repositoryPath, remotePath, bundlePath } = fixture;
    mkdirSync(join(repositoryPath, "demo", "Private-Value"), { recursive: true });
    writeFileSync(join(repositoryPath, "demo", "Private-Value", "notes.md"), "private-value notes\n");
    writeFileSync(join(repositoryPath, "private-value-tool.mjs"), "export const tool = 1;\n");
    writeFileSync(join(repositoryPath, "README.md"), "plain\n");
    git(repositoryPath, "add", ".");
    git(repositoryPath, "commit", "-m", "add named paths");

    const prepared = prepareCleanHistory(repositoryPath, {
      branch: "clean/history",
      bundlePath,
      keywords: [{ id: "keyword:1", value: "private-value", match: "substring" }],
    });

    const paths = git(remotePath, "ls-tree", "-r", "--name-only", "refs/heads/clean/history").split("\n");
    assert.deepEqual(paths.sort(), ["README.md", "demo/keyword-1/notes.md", "keyword-1-tool.mjs"]);
    assert.equal(paths.some((path) => /[<>:]/.test(path)), false, "paths stay valid on Windows");
    assert.equal(
      git(remotePath, "log", "-p", "--format=", "refs/heads/clean/history").toLowerCase().includes("private-value"),
      false,
    );
    assert.equal(
      git(remotePath, "log", "--name-only", "--format=", "refs/heads/clean/history").toLowerCase().includes("private-value"),
      false,
    );
    assert.equal(prepared.commitCount, 1);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("refuses a rewrite that would collapse two tree entries onto one name", () => {
  const fixture = repositoryWithRemote("aiformat-reset-collision-");
  try {
    const { repositoryPath, remotePath, bundlePath } = fixture;
    writeFileSync(join(repositoryPath, "private-value.md"), "a\n");
    writeFileSync(join(repositoryPath, "term-1.md"), "b\n");
    git(repositoryPath, "add", ".");
    git(repositoryPath, "commit", "-m", "colliding names");

    assert.throws(
      () => prepareCleanHistory(repositoryPath, {
        branch: "clean/history",
        bundlePath,
        keywords: [{ id: "term-1", value: "private-value", match: "substring" }],
      }),
      (error) => /duplicate entry names/.test(error.message) && !/private-value/i.test(error.message),
    );
    assert.equal(
      spawnSync("git", ["rev-parse", "--verify", "refs/heads/clean/history"], { cwd: remotePath }).status === 0,
      false,
      "nothing is pushed when the rewrite is refused",
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
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
