import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { runCommand } from "./command-runner.mjs";
import { assertPreparedState, observeMigration, assertPublishedMain } from "./migration-observation.mjs";

const ZERO_SHA = "0".repeat(40);

export function requireExternalFile(path, roots) {
  if (!path) throw new Error("An external file path is required.");
  const target = resolve(path);
  for (const root of roots) {
    const offset = relative(resolve(root), target);
    if (!offset || (!isAbsolute(offset) && offset !== ".." && !offset.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))) {
      throw new Error("Migration artifacts must stay outside the source/publication checkouts.");
    }
  }
  return target;
}

export function createPublicationHandoff(repository, state, {
  cwd, path, replacementId, reason, commandRunner = runCommand, uuid = randomUUID,
}) {
  assertPreparedState(repository, state);
  if (!cwd || !isAbsolute(cwd) || typeof reason !== "string" || !reason.trim() || reason.length > 4000) {
    throw new Error("handoff requires absolute --publication-cwd and a non-empty --reason (max 4000 characters).");
  }
  const root = resolve(cwd);
  const handoffPath = requireExternalFile(path, [repository.localPath, root]);
  const bundlePath = requireExternalFile(state.bundlePath, [repository.localPath, root]);
  const git = (at, args) => commandRunner("git", args, { cwd: at });
  if (realpathSync(git(root, ["rev-parse", "--show-toplevel"])) !== realpathSync(root)
    || !git(root, ["branch", "--show-current"])
    || git(root, ["remote", "get-url", "origin"]) !== `https://github.com/${repository.nameWithOwner}.git`) {
    throw new Error("Publication requires a normal checkout root, attached branch and canonical origin.");
  }
  const common = (at) => realpathSync(resolve(at, git(at, ["rev-parse", "--git-common-dir"])));
  if (common(root) !== common(repository.localPath)) {
    throw new Error("Publication checkout must share the manifest source object database.");
  }
  git(root, ["bundle", "verify", bundlePath]);
  if (git(root, ["bundle", "list-heads", bundlePath]) !== `${state.cleanHistoryTip} refs/heads/cleaned`
    || git(root, ["cat-file", "-t", state.cleanHistoryTip]) !== "commit") {
    throw new Error("Bundle/local commit differs from the prepared tip; import the bundle before handoff.");
  }
  const observation = observeMigration(repository, state, replacementId, commandRunner);
  if (observation.refs.length) throw new Error("Replacement is not empty; inspect or reconcile the existing publication.");
  const handoff = { id: uuid(), repository: repository.nameWithOwner, cwd: root,
    reason, updates: [{ ref: "refs/heads/main", oldSha: ZERO_SHA, newSha: state.cleanHistoryTip }] };
  // Never replace an ID that may already have been submitted to the Rv single-attempt ledger.
  writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { handoffPath, id: handoff.id, status: "awaiting_submission", replacementRepositoryId: replacementId };
}

export function verifyPublication(repository, state, {
  path, replacementId, commandRunner = runCommand, now = () => new Date().toISOString(),
}) {
  const handoff = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(handoff.id ?? "")
    || handoff.repository !== repository.nameWithOwner || handoff.updates?.length !== 1
    || handoff.updates[0].ref !== "refs/heads/main" || handoff.updates[0].oldSha !== ZERO_SHA
    || handoff.updates[0].newSha !== state.cleanHistoryTip) {
    throw new Error("Handoff does not describe this create-only migration.");
  }
  const observation = observeMigration(repository, state, replacementId, commandRunner);
  assertPublishedMain(observation, state.cleanHistoryTip);
  // A replacement starts empty: one item suffices to disprove the zero PR/Issue expectation.
  const issues = JSON.parse(commandRunner("gh", ["api",
    `repos/${repository.nameWithOwner}/issues?state=all&per_page=1`]));
  if (!Array.isArray(issues) || issues.length) throw new Error("Replacement contains unexpected PRs or Issues.");
  return { ...state, migrated: true, replacementRepositoryId: replacementId,
    archiveRepositoryId: observation.archive.id, publicationHandoffId: handoff.id,
    verifiedAt: now(), localSynchronizationRequired: true };
}
