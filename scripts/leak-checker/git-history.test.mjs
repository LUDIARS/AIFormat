import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listPublishedCommitMessages, parseCommitLog, scanCommitMessages } from "./git-history.mjs";

const keywords = [
  { id: "product-001", value: "SecretTitle", match: "substring" },
  { id: "customer-001", value: "AcmeCorp", match: "substring" },
];
const sha1A = "a".repeat(40);
const sha1B = "b".repeat(40);
const sha256C = "c".repeat(64);

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "AIFormat test",
      GIT_AUTHOR_EMAIL: "aiformat-test@example.invalid",
      GIT_COMMITTER_NAME: "AIFormat test",
      GIT_COMMITTER_EMAIL: "aiformat-test@example.invalid",
    },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
}

test("parses NUL-separated records into commit and message", () => {
  const stdout = `${sha1A}\nfeat: add thing\n\nbody line\n\u0000${sha1B}\nchore: tidy\n\u0000`;
  assert.deepEqual(parseCommitLog(stdout), [
    { commit: sha1A, message: "feat: add thing\n\nbody line\n" },
    { commit: sha1B, message: "chore: tidy\n" },
  ]);
});

test("rejects malformed records instead of reporting a false-clean audit", () => {
  assert.throws(
    () => parseCommitLog("\u0000not-a-sha\nmessage\n\u0000"),
    /expected a full commit id/i,
  );
  assert.throws(() => parseCommitLog(Buffer.from("text")), /expected text/i);
  assert.deepEqual(parseCommitLog(""), []);
});

test("a commit with no message body still parses", () => {
  assert.deepEqual(parseCommitLog(`${sha1A}\u0000`), [{ commit: sha1A, message: "" }]);
});

test("accepts full SHA-256 object ids", () => {
  assert.deepEqual(parseCommitLog(`${sha256C}\nmessage\n\u0000`), [
    { commit: sha256C, message: "message\n" },
  ]);
});

test("reads only refs that reached the remote", () => {
  const calls = [];
  listPublishedCommitMessages("C:/repo", {
    commandRunner: (command, args, options) => {
      calls[calls.length] = { command, args, options };
      return "";
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "git");
  assert.ok(calls[0].args.includes("--remotes=origin"));
  assert.equal(calls[0].options.cwd, "C:/repo");
});

test("reads a commit message from an actual remote-tracking ref", () => {
  const root = mkdtempSync(join(tmpdir(), "aiformat-history-"));
  try {
    runGit(root, ["init"]);
    runGit(root, [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "published message",
    ]);
    runGit(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);

    const commits = listPublishedCommitMessages(root);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].message.trim(), "published message");
    assert.match(commits[0].commit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("passes a max-count only when a limit is asked for", () => {
  const seen = [];
  const runner = (command, args) => { seen[seen.length] = args; return ""; };
  listPublishedCommitMessages("C:/repo", { commandRunner: runner });
  listPublishedCommitMessages("C:/repo", { commandRunner: runner, limit: 5 });
  assert.equal(seen[0].some((arg) => arg.startsWith("--max-count")), false);
  assert.ok(seen[1].includes("--max-count=5"));
});

// レポートは共有され得るので、どの語が出たかは id でしか返さない。
test("reports keyword ids per commit and never the matched value", () => {
  const findings = scanCommitMessages([
    { commit: "aaa1111", message: "docs: describe SecretTitle rollout" },
    { commit: "bbb2222", message: "chore: bump deps" },
    { commit: "ccc3333", message: "feat: AcmeCorp portal\n\nalso SecretTitle" },
  ], keywords);
  assert.deepEqual(findings, [
    { commit: "aaa1111", keywordIds: ["product-001"] },
    { commit: "ccc3333", keywordIds: ["customer-001", "product-001"] },
  ]);
  assert.equal(JSON.stringify(findings).includes("SecretTitle"), false);
  assert.equal(JSON.stringify(findings).includes("AcmeCorp"), false);
});

test("matching is case-insensitive so a lowercased mention is not missed", () => {
  assert.deepEqual(
    scanCommitMessages([{ commit: "aaa1111", message: "fix: secrettitle typo" }], keywords),
    [{ commit: "aaa1111", keywordIds: ["product-001"] }],
  );
});
