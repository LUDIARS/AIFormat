import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadKeywordConfig,
  normalizeKeywords,
  redactKeywordValues,
} from "./keyword-config.mjs";

function writeConfig(value) {
  const root = mkdtempSync(join(tmpdir(), "aiformat-keywords-"));
  const path = join(root, "keywords.json");
  writeFileSync(path, JSON.stringify(value));
  return { root, path };
}

test("loads legacy strings and labelled keyword objects", () => {
  const { root, path } = writeConfig({
    keywords: [
      "legacy-term",
      { id: "engagement-1", value: "private-term" },
    ],
    ignore_patterns: ["docs/public-example.md"],
  });
  try {
    const config = loadKeywordConfig(path);
    assert.match(config.keywords[0].id, /^keyword:[0-9a-f]{12}$/);
    assert.deepEqual(config.keywords.slice(1), [
      { id: "engagement-1", value: "private-term", match: "substring" },
    ]);
    assert.deepEqual(config.ignorePatterns, ["docs/public-example.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects malformed keyword configuration", () => {
  const { root, path } = writeConfig({
    keywords: [{ id: "engagement-1" }],
    ignore_patterns: [],
  });
  try {
    assert.throws(() => loadKeywordConfig(path), /keyword value/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not expose an external configuration path in read errors", () => {
  const privatePath = join(tmpdir(), "private-customer-name", "missing.json");
  assert.throws(
    () => loadKeywordConfig(privatePath),
    (error) => {
      assert.equal(error.message.includes(privatePath), false);
      assert.equal(error.cause, undefined);
      assert.match(error.message, /cannot read keyword configuration/i);
      return true;
    },
  );
});

test("rejects labels that repeat any configured keyword value", () => {
  assert.throws(
    () => normalizeKeywords([
      { id: "private-term-result", value: "private-term" },
    ]),
    /must not contain a keyword value/i,
  );
});

test("redacts configured values in paths without changing neutral context", () => {
  const redacted = redactKeywordValues(
    "docs/PrivateTerm/design.md",
    [{ id: "engagement-1", value: "PrivateTerm" }],
  );

  assert.equal(redacted, "docs/[engagement-1]/design.md");
  assert.equal(redacted.includes("PrivateTerm"), false);
});
