import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { scanDirectory } from "./scanner.mjs";

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "aiformat-leak-scan-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("finds case-insensitive references without returning values or source content", () => {
  withFixture((root) => {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "design.md"), "Uses HiddenProject internally.\n");

    const findings = scanDirectory(root, [
      { id: "engagement-1", value: "hiddenproject" },
    ]);

    assert.deepEqual(findings, [{
      file: "docs/design.md",
      line: 1,
      keywordIds: ["engagement-1"],
    }]);
    assert.equal(JSON.stringify(findings).includes("HiddenProject"), false);
  });
});

test("redacts keyword values embedded in finding paths", () => {
  withFixture((root) => {
    mkdirSync(join(root, "HiddenProject"));
    writeFileSync(join(root, "HiddenProject", "design.md"), "Uses HiddenProject internally.\n");

    const findings = scanDirectory(root, [
      { id: "engagement-1", value: "hiddenproject" },
    ]);

    assert.deepEqual(findings, [{
      file: "[engagement-1]/design.md",
      line: 1,
      keywordIds: ["engagement-1"],
    }]);
    assert.equal(JSON.stringify(findings).toLowerCase().includes("hiddenproject"), false);
  });
});

test("honors ignored directories, binary files, config names, and path patterns", () => {
  withFixture((root) => {
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, ".git", "config"), "HiddenProject");
    writeFileSync(join(root, "asset.bin"), Buffer.from([0, 1, 2, 3]));
    writeFileSync(join(root, "env-leak-keywords.local.json"), "HiddenProject");
    writeFileSync(join(root, "docs", "allowed.md"), "HiddenProject");
    writeFileSync(join(root, "docs", "blocked.md"), "HiddenProject");

    const findings = scanDirectory(
      root,
      [{ id: "engagement-1", value: "HiddenProject" }],
      { ignorePatterns: ["docs/allowed.md"] },
    );

    assert.deepEqual(findings, [{
      file: "docs/blocked.md",
      line: 1,
      keywordIds: ["engagement-1"],
    }]);
  });
});

test("rejects empty or duplicate keyword identifiers", () => {
  withFixture((root) => {
    assert.throws(
      () => scanDirectory(root, [{ id: "", value: "term" }]),
      /keyword id/i,
    );
    assert.throws(
      () => scanDirectory(root, [
        { id: "same", value: "one" },
        { id: "same", value: "two" },
      ]),
      /duplicate keyword id/i,
    );
  });
});

test("can stop at nested repository boundaries", () => {
  withFixture((root) => {
    mkdirSync(join(root, "nested", ".git"), { recursive: true });
    writeFileSync(join(root, "root.md"), "HiddenProject");
    writeFileSync(join(root, "nested", "private.md"), "HiddenProject");

    const findings = scanDirectory(
      root,
      [{ id: "engagement-1", value: "HiddenProject" }],
      { ignoreNestedRepositories: true },
    );

    assert.deepEqual(findings, [{
      file: "root.md",
      line: 1,
      keywordIds: ["engagement-1"],
    }]);
  });
});

test("token matching rejects longer identifiers while allowing punctuation boundaries", () => {
  withFixture((root) => {
    writeFileSync(
      join(root, "source.txt"),
      "PrivateEngineAdapter\nUses PrivateEngine.\n",
    );

    const findings = scanDirectory(root, [{
      id: "private-repo:1",
      value: "PrivateEngine",
      match: "token",
    }]);

    assert.deepEqual(findings, [{
      file: "source.txt",
      line: 2,
      keywordIds: ["private-repo:1"],
    }]);
  });
});

test("tracked-file mode skips submodule directory entries", () => {
  withFixture((root) => {
    mkdirSync(join(root, "external-module"));
    writeFileSync(join(root, "README.md"), "HiddenProject");

    const findings = scanDirectory(
      root,
      [{ id: "engagement-1", value: "HiddenProject" }],
      { relativeFiles: ["external-module", "README.md"], strict: true },
    );

    assert.deepEqual(findings, [{
      file: "README.md",
      line: 1,
      keywordIds: ["engagement-1"],
    }]);
  });
});

test("tracked-file mode skips files deleted from the working tree", () => {
  const root = mkdtempSync(join(tmpdir(), "aiformat-leak-deleted-"));
  try {
    assert.deepEqual(
      scanDirectory(
        root,
        [{ id: "private-1", value: "HiddenProject" }],
        {
          relativeFiles: ["deleted.md"],
          strict: true,
        },
      ),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
