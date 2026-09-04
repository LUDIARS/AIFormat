import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRepositoryFindings,
  createRepositoryAuditError,
  isAuditClean,
  repositoryAuditReference,
  scanRepositoryCheckouts,
} from "./github-public-leak-audit.mjs";

const localFinding = {
  file: "docs/reference.md",
  line: 7,
  keywordIds: ["private-repo:123456789abc"],
};

test("retains labelled locations only for public repositories", () => {
  assert.deepEqual(
    classifyRepositoryFindings(
      {
        nameWithOwner: "Example/PublicDocs",
        visibility: "public",
      },
      [localFinding],
    ),
    {
      publicFindings: [{
        repository: "Example/PublicDocs",
        surface: "local-tracked-files",
        path: "docs/reference.md",
        line: 7,
        keywordIds: ["private-repo:123456789abc"],
      }],
      privateFindingsIgnored: 0,
    },
  );
});

test("discards private repository locations and labels", () => {
  const classified = classifyRepositoryFindings(
    {
      nameWithOwner: "Example/PrivateDocs",
      visibility: "private",
    },
    [localFinding],
  );

  assert.deepEqual(classified, {
    publicFindings: [],
    privateFindingsIgnored: 1,
  });
  assert.equal(JSON.stringify(classified).includes("PrivateDocs"), false);
  assert.equal(JSON.stringify(classified).includes("private-repo:"), false);
});

test("redacts non-public repository names and error details", () => {
  const repository = {
    nameWithOwner: "Example/PrivateDocs",
    visibility: "private",
  };
  const reference = repositoryAuditReference(repository);
  const auditError = createRepositoryAuditError(
    "local-scan",
    repository,
    new Error("Cannot read C:\\workspace\\PrivateDocs\\secret.txt"),
  );
  const serialized = JSON.stringify({ reference, auditError });

  assert.match(reference, /^private-repository:[0-9a-f]{12}$/);
  assert.equal(serialized.includes("PrivateDocs"), false);
  assert.equal(serialized.includes("secret.txt"), false);
});

test("retains public repository names and useful error details", () => {
  const repository = {
    nameWithOwner: "Example/PublicDocs",
    visibility: "public",
  };
  const auditError = createRepositoryAuditError(
    "local-scan",
    repository,
    new Error("Cannot read docs/reference.md"),
  );

  assert.deepEqual(auditError, {
    stage: "local-scan",
    repository: "Example/PublicDocs",
    message: "Cannot read docs/reference.md",
  });
});

test("redacts local checkout roots from public repository errors", () => {
  const repository = {
    nameWithOwner: "Example/PublicDocs",
    visibility: "public",
  };
  const localPath = "C:\\workspace\\PublicDocs";
  const auditError = createRepositoryAuditError(
    "local-scan",
    repository,
    new Error(`Cannot read ${localPath}\\docs\\reference.md`),
    [],
    { privatePaths: [localPath] },
  );

  assert.equal(auditError.message.includes(localPath), false);
  assert.equal(auditError.message, "Cannot read [local-path]\\docs\\reference.md");
});

test("opens the gate only when findings and errors are both empty", () => {
  assert.equal(isAuditClean([], []), true);
  assert.equal(isAuditClean([localFinding], []), false);
  assert.equal(isAuditClean([], [new Error("scan failed")]), false);
});

test("scans every checkout of a repository", () => {
  const repository = {
    name: "PublicDocs",
    nameWithOwner: "Example/PublicDocs",
    visibility: "public",
  };
  const scannedPaths = [];
  const result = scanRepositoryCheckouts({
    repository,
    workspaceRepositories: [
      { nameWithOwner: repository.nameWithOwner, path: "C:/workspace/PublicDocs-feature" },
      { nameWithOwner: repository.nameWithOwner, path: "C:/workspace/PublicDocs" },
    ],
    keywords: [],
    readTrackedFiles: () => ["docs/reference.md"],
    scanTrackedFiles: (path) => {
      scannedPaths.push(path);
      return [localFinding];
    },
  });

  assert.deepEqual(scannedPaths, [
    "C:/workspace/PublicDocs",
    "C:/workspace/PublicDocs-feature",
  ]);
  assert.equal(result.publicFindings.length, 2);
  assert.equal(result.localPublicRepositoriesScanned, 2);
  assert.deepEqual(result.errors, []);
});

test("fails a checkout scan closed without hiding successful checkout findings", () => {
  const repository = {
    name: "PublicDocs",
    nameWithOwner: "Example/PublicDocs",
    visibility: "public",
  };
  const result = scanRepositoryCheckouts({
    repository,
    workspaceRepositories: [
      { nameWithOwner: repository.nameWithOwner, path: "C:/workspace/PublicDocs" },
      { nameWithOwner: repository.nameWithOwner, path: "C:/workspace/PublicDocs-feature" },
    ],
    keywords: [],
    readTrackedFiles: (path) => {
      if (path.endsWith("-feature")) throw new Error("cannot read checkout");
      return ["docs/reference.md"];
    },
    scanTrackedFiles: () => [localFinding],
  });

  assert.equal(result.publicFindings.length, 1);
  assert.equal(result.localPublicRepositoriesScanned, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].stage, "local-scan");
});
