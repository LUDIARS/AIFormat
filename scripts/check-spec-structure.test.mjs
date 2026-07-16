import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-spec-structure.mjs");

function withRepo(run) {
  const repo = mkdtempSync(join(tmpdir(), "aiformat-spec-structure-"));
  try {
    return run(repo);
  } finally {
    rmSync(repo, { force: true, recursive: true });
  }
}

function readJson(repo) {
  return JSON.parse(execFileSync(process.execPath, [script, repo, "--json"], { encoding: "utf8" }));
}

test("追加フォルダと spec 直下ファイルを許可する", () => withRepo((repo) => {
  mkdirSync(join(repo, "spec", "tasks"), { recursive: true });
  writeFileSync(join(repo, "spec", "architecture.md"), "# Architecture\n", "utf8");

  const result = readJson(repo);

  assert.deepEqual(result.present, ["tasks"]);
  assert.equal(result.violations.length, 0);
  assert.equal(result.warnings.length, 5);
}));

test("標準5フォルダの欠落は warning だけで exit 0", () => withRepo((repo) => {
  const result = spawnSync(process.execPath, [script, repo], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.match(result.stderr, /MISSING_REQUIRED_DIR/);
  assert.equal(readJson(repo).warnings.length, 5);
}));

test("標準5フォルダが揃えば warning は出ない", () => withRepo((repo) => {
  for (const name of ["data", "feature", "interface", "setup", "test"]) {
    mkdirSync(join(repo, "spec", name), { recursive: true });
  }

  const result = readJson(repo);

  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.violations, []);
}));

test("spec/data を巻き込む data/ gitignore は引き続き失敗する", () => withRepo((repo) => {
  mkdirSync(join(repo, "spec", "data"), { recursive: true });
  writeFileSync(join(repo, ".gitignore"), "data/\n", "utf8");

  const result = spawnSync(process.execPath, [script, repo, "--json"], { encoding: "utf8" });

  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).violations[0].kind, "GITIGNORE_DATA");
}));
