import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPublicationHandoff, verifyPublication, requireExternalFile } from "./publication-handoff.mjs";

test("create-only handoff preserves its ID on repeat and verification rejects new PRs", () => {
  const temp = mkdtempSync(join(tmpdir(), "reset-handoff-"));
  try {
    const cwd = join(temp, "checkout");
    const common = join(cwd, ".git");
    mkdirSync(common, { recursive: true });
    const repository = { nameWithOwner: "Example/Product", organization: "Example", archiveName: "Product-archive",
      cleanBranch: "clean/reset", newVisibility: "public", localPath: cwd };
    const state = { repository: repository.nameWithOwner, cleanBranch: repository.cleanBranch,
      historyPolicy: "preserve-rewritten-commit-graph", originalRepositoryId: 10, cleanHistoryTip: "a".repeat(40),
      bundlePath: join(temp, "history.bundle") };
    const replacement = { id: 20, full_name: "Example/Product", visibility: "public", archived: false, default_branch: "main" };
    const archive = { id: 10, full_name: "Example/Product-archive", visibility: "private", archived: true };
    let remoteRefs = "";
    let issues = [];
    const commandRunner = (command, args) => {
      if (command === "gh") {
        assert.equal(args[0], "api");
        assert.equal(args.length, 2, "only read-only API requests are allowed");
        return JSON.stringify(args[1].includes("/issues?") ? issues : args[1].endsWith("-archive") ? archive : replacement);
      }
      assert.equal(command, "git");
      if (args[0] === "ls-remote") return remoteRefs;
      if (args.join(" ") === "rev-parse --show-toplevel") return cwd;
      if (args.join(" ") === "rev-parse --git-common-dir") return common;
      if (args.join(" ") === "branch --show-current") return "main";
      if (args.join(" ") === "remote get-url origin") return "https://github.com/Example/Product.git";
      if (args[0] === "bundle" && args[1] === "verify") return "";
      if (args[0] === "bundle" && args[1] === "list-heads") return `${state.cleanHistoryTip} refs/heads/cleaned`;
      if (args[0] === "cat-file") return "commit";
      throw new Error(`Unexpected Git mutation or command: ${args[0]}`);
    };
    const path = join(temp, "handoff.json");
    const options = { cwd, path, replacementId: 20, reason: "Approved migration", commandRunner,
      uuid: () => "11111111-1111-4111-8111-111111111111" };
    const created = createPublicationHandoff(repository, state, options);
    assert.equal(created.status, "awaiting_submission");
    const contents = readFileSync(path, "utf8");
    const doc = JSON.parse(contents);
    assert.equal(doc.updates[0].oldSha, "0".repeat(40));
    assert.equal(doc.updates[0].newSha, state.cleanHistoryTip);
    assert.throws(() => createPublicationHandoff(repository, state, options), { code: "EEXIST" });
    assert.equal(readFileSync(path, "utf8"), contents);
    assert.throws(() => verifyPublication(repository, state, options), /not verified/);
    remoteRefs = `${state.cleanHistoryTip}\trefs/heads/main`;
    issues = [{ number: 1 }];
    assert.throws(() => verifyPublication(repository, state, options), /unexpected PRs/);
    issues = [];
    const verified = verifyPublication(repository, state, { ...options, now: () => "2026-09-16T00:00:00Z" });
    assert.equal(verified.migrated, true);
    assert.equal(verified.localSynchronizationRequired, true);
    assert.equal(state.migrated, undefined, "input state remains unchanged");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("artifact paths cannot be inside either checkout", () => {
  const root = join(tmpdir(), "source");
  assert.throws(() => requireExternalFile(join(root, "state.json"), [root]), /outside/);
  assert.throws(() => requireExternalFile(root, [root]), /outside/);
  assert.equal(requireExternalFile(join(tmpdir(), "external.json"), [root]), join(tmpdir(), "external.json"));
});
