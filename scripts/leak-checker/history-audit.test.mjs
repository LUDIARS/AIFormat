import assert from "node:assert/strict";
import test from "node:test";

import {
  auditPublishedHistory,
  historyAuditExitCode,
  parseArguments,
} from "../github-public-history-audit.mjs";

const keywords = [{ id: "product-001", value: "SecretTitle", match: "substring" }];
const publicRepo = { name: "Docs", nameWithOwner: "Example/Docs", visibility: "public" };
const privateRepo = { name: "Inner", nameWithOwner: "Example/Inner", visibility: "private" };

test("reports only public repositories", () => {
  const report = auditPublishedHistory({
    repositories: [publicRepo, privateRepo],
    workspaceRepositories: [
      { nameWithOwner: "Example/Docs", path: "C:/w/Docs" },
      { nameWithOwner: "Example/Inner", path: "C:/w/Inner" },
    ],
    keywords,
    readCommits: () => [{ commit: "aaa1111", message: "docs: SecretTitle" }],
  });
  assert.equal(report.metrics.publicRepositoriesScanned, 1);
  assert.deepEqual(report.findings.map((f) => f.repository), ["Example/Docs"]);
  assert.equal(report.gate, false);
});

// 同じリポの checkout が 2 つあるとき、片方にしか無い流出も拾う。
test("scans every checkout and folds a commit seen in more than one", () => {
  const byPath = {
    "C:/w/Docs": [{ commit: "aaa1111", message: "docs: SecretTitle" }],
    "C:/w/Docs-feature": [
      { commit: "aaa1111", message: "docs: SecretTitle" },
      { commit: "bbb2222", message: "chore: SecretTitle again" },
    ],
  };
  const report = auditPublishedHistory({
    repositories: [publicRepo],
    workspaceRepositories: [
      { nameWithOwner: "Example/Docs", path: "C:/w/Docs-feature" },
      { nameWithOwner: "Example/Docs", path: "C:/w/Docs" },
    ],
    keywords,
    readCommits: (path) => byPath[path],
  });
  assert.equal(report.metrics.checkoutsScanned, 2);
  assert.deepEqual(report.findings.map((f) => f.commit), ["aaa1111", "bbb2222"]);
});

test("passes the gate when no registered word appears", () => {
  const report = auditPublishedHistory({
    repositories: [publicRepo],
    workspaceRepositories: [{ nameWithOwner: "Example/Docs", path: "C:/w/Docs" }],
    keywords,
    readCommits: () => [{ commit: "aaa1111", message: "chore: bump deps" }],
  });
  assert.equal(report.gate, true);
  assert.deepEqual(report.findings, []);
});

// 読めなかったリポを黙って通すと「流出なし」と「見ていない」が同じ結果になる。
test("a repository that cannot be read fails the gate as an error", () => {
  const report = auditPublishedHistory({
    repositories: [publicRepo],
    workspaceRepositories: [{ nameWithOwner: "Example/Docs", path: "C:/w/Docs" }],
    keywords,
    readCommits: () => { throw new Error("git failed: SecretTitle ref"); },
  });
  assert.equal(report.findings.length, 0);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].stage, "history-scan");
  assert.equal(report.gate, false);
  assert.equal(report.errors[0].repository.includes("Docs"), false);
  assert.equal(JSON.stringify(report.errors).includes("SecretTitle"), false);
});

test("a public repository with no local checkout is not counted as scanned", () => {
  const report = auditPublishedHistory({
    repositories: [publicRepo],
    workspaceRepositories: [],
    keywords,
    readCommits: () => { throw new Error("should not be called"); },
  });
  assert.equal(report.metrics.publicRepositoriesScanned, 0);
  assert.equal(report.metrics.checkoutsScanned, 0);
});

test("redacts keyword values that appear in a public repository name", () => {
  const repository = {
    name: "SecretTitle-Docs",
    nameWithOwner: "Example/SecretTitle-Docs",
    visibility: "public",
  };
  const report = auditPublishedHistory({
    repositories: [repository],
    workspaceRepositories: [{
      nameWithOwner: repository.nameWithOwner,
      path: "C:/w/SecretTitle-Docs",
    }],
    keywords,
    readCommits: () => [{ commit: "aaa1111", message: "docs: SecretTitle" }],
  });
  assert.equal(JSON.stringify(report).includes("SecretTitle"), false);
  assert.equal(report.findings[0].repository, "Example/[product-001]-Docs");
});

test("rejects an empty keyword set instead of returning a false-clean report", () => {
  assert.throws(
    () => auditPublishedHistory({
      repositories: [publicRepo],
      workspaceRepositories: [{ nameWithOwner: "Example/Docs", path: "C:/w/Docs" }],
      keywords: [],
      readCommits: () => [],
    }),
    /at least one keyword/i,
  );
});

test("uses distinct exit codes for findings and incomplete scans", () => {
  assert.equal(historyAuditExitCode({ findings: [], errors: [] }), 0);
  assert.equal(historyAuditExitCode({ findings: [{}], errors: [] }), 1);
  assert.equal(historyAuditExitCode({ findings: [], errors: [{}] }), 2);
});

test("rejects partial or unsafe history limits", () => {
  assert.throws(() => parseArguments(["--limit", "5commits"]), /non-negative integer/i);
  assert.throws(() => parseArguments(["--limit", "1.5"]), /non-negative integer/i);
  assert.throws(
    () => parseArguments(["--limit", "999999999999999999999999"]),
    /non-negative integer/i,
  );
});
