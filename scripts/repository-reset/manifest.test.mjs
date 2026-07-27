import assert from "node:assert/strict";
import test from "node:test";

import { parseResetManifest } from "./manifest.mjs";

const validManifest = {
  version: 1,
  repositories: [{
    organization: "ExampleOrg",
    name: "ExampleRepo",
    local_path: "C:/workspace/ExampleRepo",
    archive_name: "ExampleRepo-archive-20260728",
    clean_branch: "clean/repository-reset-20260728",
    new_visibility: "public",
    archive_visibility: "private",
  }],
};

test("normalizes an explicit repository reset manifest", () => {
  const manifest = parseResetManifest(JSON.stringify(validManifest));

  assert.equal(manifest.repositories[0].nameWithOwner, "ExampleOrg/ExampleRepo");
  assert.equal(manifest.repositories[0].archiveVisibility, "private");
});

test("rejects archive name reuse and duplicate targets", () => {
  assert.throws(
    () => parseResetManifest(JSON.stringify({
      ...validManifest,
      repositories: [{
        ...validManifest.repositories[0],
        archive_name: "ExampleRepo",
      }],
    })),
    /archive_name must differ/i,
  );
  assert.throws(
    () => parseResetManifest(JSON.stringify({
      ...validManifest,
      repositories: [
        validManifest.repositories[0],
        validManifest.repositories[0],
      ],
    })),
    /duplicate repository/i,
  );
});
