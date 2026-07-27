import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRepositoryFindings,
  createRepositoryAuditError,
  repositoryAuditReference,
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
