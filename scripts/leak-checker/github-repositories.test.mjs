import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseWorkspaceRepository,
  derivePrivateRepositoryKeywords,
  listTrackedFiles,
  parseGitHubRepositoryName,
  parseRepositoryInventory,
  scanPublicRepositoryMetadata,
  viewRepository,
} from "./github-repositories.mjs";

const inventory = [
  {
    name: "PublicDocs",
    nameWithOwner: "Example/PublicDocs",
    visibility: "PUBLIC",
    url: "https://github.com/Example/PublicDocs",
    isArchived: false,
    description: "Public documentation",
  },
  {
    name: "PrivateEngine",
    nameWithOwner: "Example/PrivateEngine",
    visibility: "PRIVATE",
    url: "https://github.com/Example/PrivateEngine",
    isArchived: false,
    description: "Internal",
  },
];

test("validates repository inventory and normalizes visibility", () => {
  const parsed = parseRepositoryInventory(JSON.stringify(inventory), "Example");
  assert.equal(parsed[0].visibility, "public");
  assert.equal(parsed[1].visibility, "private");
  assert.throws(
    () => parseRepositoryInventory('[{"name":"broken"}]', "Example"),
    /invalid repository inventory/i,
  );
});

test("derives redacted labels for private full and bare repository names", () => {
  const keywords = derivePrivateRepositoryKeywords(
    parseRepositoryInventory(JSON.stringify(inventory), "Example"),
  );
  assert.deepEqual(
    keywords.map(({ value }) => value).sort(),
    ["Example/PrivateEngine", "PrivateEngine"],
  );
  assert.equal(JSON.stringify(keywords.map(({ id }) => id)).includes("PrivateEngine"), false);
});

test("reports public metadata by label without returning the sensitive value", () => {
  const publicRepos = parseRepositoryInventory(JSON.stringify([
    {
      ...inventory[0],
      description: "Integrates with PrivateEngine",
    },
  ]), "Example");
  const keywords = [{ id: "private-repo:123456789abc", value: "PrivateEngine" }];

  const findings = scanPublicRepositoryMetadata(publicRepos, keywords);

  assert.deepEqual(findings, [{
    repository: "Example/PublicDocs",
    surface: "metadata",
    field: "description",
    keywordIds: ["private-repo:123456789abc"],
  }]);
  assert.equal(JSON.stringify(findings).includes("PrivateEngine"), false);
});

test("lists only git-tracked paths from NUL-delimited output", () => {
  const calls = [];
  const files = listTrackedFiles("C:/workspace/PublicDocs", {
    commandRunner(command, args, options) {
      calls.push({ command, args, options });
      return "README.md\0docs/design.md\0";
    },
  });
  assert.deepEqual(files, ["README.md", "docs/design.md"]);
  assert.deepEqual(calls[0].args, ["ls-files", "-z"]);
});

test("resolves renamed repository metadata through gh without fetching source", () => {
  const calls = [];
  const repository = viewRepository("Example/OldName", {
    commandRunner(command, args) {
      calls.push({ command, args });
      return JSON.stringify(inventory[0]);
    },
  });
  assert.equal(repository.nameWithOwner, "Example/PublicDocs");
  assert.equal(repository.visibility, "public");
  assert.deepEqual(calls[0], {
    command: "gh",
    args: [
      "repo",
      "view",
      "Example/OldName",
      "--json",
      "name,nameWithOwner,visibility,url,isArchived,isEmpty,description",
    ],
  });
});

test("parses HTTPS and SSH GitHub remotes", () => {
  assert.equal(
    parseGitHubRepositoryName("https://github.com/Example/PublicDocs.git"),
    "Example/PublicDocs",
  );
  assert.equal(
    parseGitHubRepositoryName("git@github.com:Example/PublicDocs.git"),
    "Example/PublicDocs",
  );
  assert.equal(parseGitHubRepositoryName("https://gitlab.com/a/b.git"), null);
});

test("prefers the canonical workspace directory when duplicate worktrees exist", () => {
  assert.deepEqual(
    chooseWorkspaceRepository(inventory[0], [
      {
        nameWithOwner: "Example/PublicDocs",
        path: "C:/workspace/PublicDocs-feature",
      },
      {
        nameWithOwner: "Example/PublicDocs",
        path: "C:/workspace/PublicDocs",
      },
    ]),
    {
      nameWithOwner: "Example/PublicDocs",
      path: "C:/workspace/PublicDocs",
    },
  );
});
