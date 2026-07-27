import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "env-leak-checker.mjs");

test("uses the ignored local config by default without dropping the command", () => {
  const result = spawnSync(
    process.execPath,
    [script, "list"],
    { encoding: "utf8", shell: false, windowsHide: true },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Keywords:/);
  assert.doesNotMatch(result.stdout, /Usage:/);
});

test("scan exits one for findings and redacts values and source content by default", () => {
  const root = mkdtempSync(join(tmpdir(), "aiformat-env-leak-cli-"));
  const repository = join(root, "repository");
  const config = join(root, "keywords.json");
  try {
    mkdirSync(join(repository, ".git"), { recursive: true });
    writeFileSync(
      join(repository, "README.md"),
      "This line mentions HiddenProject and private details.\n",
    );
    writeFileSync(config, JSON.stringify({
      keywords: [{ id: "engagement-1", value: "HiddenProject" }],
      ignore_patterns: [],
    }));

    const result = spawnSync(
      process.execPath,
      [script, "scan", repository, "--config", config],
      { encoding: "utf8", shell: false, windowsHide: true },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /README\.md:1\s+\[engagement-1\]/);
    assert.equal(result.stdout.includes("HiddenProject"), false);
    assert.equal(result.stdout.includes("private details"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("show-content is an explicit opt-in", () => {
  const root = mkdtempSync(join(tmpdir(), "aiformat-env-leak-content-"));
  const repository = join(root, "repository");
  const config = join(root, "keywords.json");
  try {
    mkdirSync(join(repository, ".git"), { recursive: true });
    writeFileSync(join(repository, "README.md"), "HiddenProject reference\n");
    writeFileSync(config, JSON.stringify({
      keywords: [{ id: "engagement-1", value: "HiddenProject" }],
      ignore_patterns: [],
    }));

    const result = spawnSync(
      process.execPath,
      [script, "scan", repository, "--config", config, "--show-content"],
      { encoding: "utf8", shell: false, windowsHide: true },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /HiddenProject reference/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
