import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResetPlan,
  migrateGitHubRepository,
} from "./github-lifecycle.mjs";

const repository = {
  organization: "ExampleOrg",
  name: "ExampleRepo",
  nameWithOwner: "ExampleOrg/ExampleRepo",
  localPath: "C:/workspace/ExampleRepo",
  archiveName: "ExampleRepo-archive-20260728",
  cleanBranch: "clean/repository-reset-20260728",
  newVisibility: "public",
  archiveVisibility: "private",
};

test("builds a no-force single-root migration plan", () => {
  assert.deepEqual(buildResetPlan(repository), {
    repository: "ExampleOrg/ExampleRepo",
    cleanBranch: "clean/repository-reset-20260728",
    archiveRepository: "ExampleOrg/ExampleRepo-archive-20260728",
    archiveVisibility: "private",
    newRepository: "ExampleOrg/ExampleRepo",
    newVisibility: "public",
    newDefaultBranch: "main",
    historyPolicy: "single-parentless-root-commit",
    forcePush: false,
  });
});

test("renames, recreates, verifies, and archives through explicit API calls", () => {
  const responses = [
    { id: 10, description: "Example" },
    { id: 10 },
    { id: 20 },
    { id: 20 },
    { id: 10 },
    { id: 20 },
    { id: 10 },
    { id: 10 },
    { id: 20, default_branch: "main" },
    { id: 10, visibility: "private", archived: true },
  ];
  const calls = [];
  const commandRunner = (command, args) => {
    calls.push([command, ...args]);
    return JSON.stringify(responses.shift());
  };
  const pushes = [];

  const result = migrateGitHubRepository(repository, {
    rootCommit: "a".repeat(40),
    commandRunner,
    pushMain: (path, options) => pushes.push({ path, options }),
  });

  assert.deepEqual(result, {
    originalRepositoryId: 10,
    replacementRepositoryId: 20,
    archiveRepositoryId: 10,
    rootCommit: "a".repeat(40),
  });
  assert.deepEqual(pushes, [{
    path: "C:/workspace/ExampleRepo",
    options: {
      commit: "a".repeat(40),
      repositoryUrl: "https://github.com/ExampleOrg/ExampleRepo.git",
    },
  }]);
  assert.equal(calls.some((call) => call.includes("--force")), false);
});
