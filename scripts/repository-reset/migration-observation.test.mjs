import assert from "node:assert/strict";
import test from "node:test";
import { assertMigrationRepositories, assertPublishedMain } from "./migration-observation.mjs";

const repository = { nameWithOwner: "Example/Product", organization: "Example", archiveName: "Product-archive",
  cleanBranch: "clean/reset", newVisibility: "public" };
const state = { repository: repository.nameWithOwner, cleanBranch: repository.cleanBranch,
  historyPolicy: "preserve-rewritten-commit-graph", originalRepositoryId: 10, cleanHistoryTip: "a".repeat(40) };
const replacement = { id: 20, full_name: "Example/Product", visibility: "public", archived: false, default_branch: "main" };
const archive = { id: 10, full_name: "Example/Product-archive", visibility: "private", archived: true };

test("a redirected original URL cannot be mistaken for the replacement", () => {
  assert.throws(() => assertMigrationRepositories(repository, state, 20, { ...replacement, id: 10 }, archive), /identity/);
});

test("requires the original archive to be both private and archived", () => {
  for (const override of [{ visibility: "public" }, { archived: false }, { id: 30 }]) {
    assert.throws(() => assertMigrationRepositories(repository, state, 20, replacement, { ...archive, ...override }), /identity/);
  }
  assertMigrationRepositories(repository, state, 20, replacement, archive);
});

test("does not adopt a replacement differing from previously recorded identity", () => {
  assert.throws(() => assertMigrationRepositories(repository, { ...state, replacementRepositoryId: 21 }, 20,
    replacement, archive), /identity/);
});

test("does not declare completion for empty, stale or extra remote refs", () => {
  const main = { ref: "refs/heads/main", sha: state.cleanHistoryTip };
  for (const refs of [[], [{ ...main, sha: "b".repeat(40) }], [main, { ref: "refs/tags/old", sha: "b".repeat(40) }]]) {
    assert.throws(() => assertPublishedMain({ replacement, refs }, state.cleanHistoryTip), /not verified/);
  }
  assertPublishedMain({ replacement, refs: [main] }, state.cleanHistoryTip);
});
