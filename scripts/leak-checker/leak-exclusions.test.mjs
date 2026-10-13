import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  enabledBuiltinDetectors,
  localPathsAllUnderRoots,
  normalizeWorkspaceRoots,
} from "./host-identifiers.mjs";
import { loadKeywordConfig } from "./keyword-config.mjs";
import {
  isExcludedHostFinding,
  isGeneratedReportPath,
  isTestPath,
} from "./leak-exclusions.mjs";
import { scanDirectory } from "./scanner.mjs";

// 値はすべて架空で、 しかも組み立てて作る。 ソースに直書きすると、 この検査自体が
// このリポジトリの差分に反応する。
const BS = String.fromCharCode(92);
const fakeRoot = ["Q:", "Fictional", "Space"].join("/");
const rootedSlash = [fakeRoot, "SomeRepo", "src"].join("/");
const rootedBackslash = ["Q:", "Fictional", "Space", "SomeRepo"].join(BS);
const outsidePath = ["Q:", "Elsewhere", "notes"].join("/");
const outsideHome = ["", "Users", "zz-person", "notes"].join("/");
const fakeIp = ["10", "20", "30", "40"].join(".");
const fakeMachine = ["zz", "host", "77"].join("-");

test("generated report and test paths follow the audit's path rules", () => {
  for (const path of ["report/index.md", "pkg/report/summary.json", "docs/view.html", "out/page.htm", "x/data.html.json"]) {
    assert.equal(isGeneratedReportPath(path), true, path);
  }
  for (const path of ["reports/a.md", "src/reporter.mjs", "docs/html-notes.md"]) {
    assert.equal(isGeneratedReportPath(path), false, path);
  }
  for (const path of ["test/a.mjs", "pkg/tests/a.ts", "src/__tests__/a.js", "fixtures/a.json", "x/fixture/b.txt", "src/a.test.ts", "src/a.spec.js", `src${BS}tests${BS}a.mjs`]) {
    assert.equal(isTestPath(path), true, path);
  }
  for (const path of ["src/testing.mjs", "contest/a.md", "src/attest.mjs", "docs/spec/a.md"]) {
    assert.equal(isTestPath(path), false, path);
  }
});

test("workspace roots are normalized and broad or malformed roots fail closed", () => {
  assert.deepEqual(normalizeWorkspaceRoots(undefined), []);
  assert.deepEqual(normalizeWorkspaceRoots([`${fakeRoot}/`, rootedBackslash]), [
    fakeRoot.toLowerCase(),
    [fakeRoot, "SomeRepo"].join("/").toLowerCase(),
  ]);
  assert.throws(() => normalizeWorkspaceRoots("Q:/x"), /must be an array/);
  for (const bad of [["Q:/"], ["/"], ["/Users"], ["relative/path"], [42]]) {
    assert.throws(() => normalizeWorkspaceRoots(bad), /invalid root/, JSON.stringify(bad));
  }
});

test("a line is excluded only when every concrete local path sits under a root", () => {
  const roots = normalizeWorkspaceRoots([fakeRoot]);
  assert.equal(localPathsAllUnderRoots(`cd ${rootedSlash}`, roots), true);
  assert.equal(localPathsAllUnderRoots(`cd ${rootedBackslash.toLowerCase()} && ls`, roots), true);
  assert.equal(localPathsAllUnderRoots(`${rootedSlash} and ${outsidePath}`, roots), false);
  assert.equal(localPathsAllUnderRoots(`${rootedSlash} and ${outsideHome}/x`, roots), false);
  assert.equal(localPathsAllUnderRoots(`${fakeRoot}Other/x`, roots), false, "prefix of a sibling folder");
  assert.equal(localPathsAllUnderRoots("no paths here", roots), false);
  assert.equal(localPathsAllUnderRoots(`cd ${rootedSlash}`, []), false, "no roots configured");
});

test("only host-category findings are excluded and the root rule is local-path only", () => {
  const options = { workspaceRoots: normalizeWorkspaceRoots([fakeRoot]) };
  assert.equal(isExcludedHostFinding({ kind: "private-ip", path: "test/a.mjs" }, options), true);
  assert.equal(isExcludedHostFinding({ kind: "machine-name", path: "report/a.md" }, options), true);
  assert.equal(isExcludedHostFinding({ kind: undefined, path: "test/a.mjs" }, options), false, "legacy keyword");
  assert.equal(isExcludedHostFinding({ kind: "local-path", path: "docs/a.md", lineText: `cd ${rootedSlash}` }, options), true);
  assert.equal(isExcludedHostFinding({ kind: "private-ip", path: "docs/a.md", lineText: `cd ${rootedSlash} ${fakeIp}` }, options), false);
  assert.equal(isExcludedHostFinding({ kind: "local-path", path: "docs/a.md", lineText: `cd ${outsidePath}` }, options), false);
});

test("scanDirectory drops excluded host findings but keeps legacy keywords", () => {
  const root = mkdtempSync(join(tmpdir(), "aiformat-leak-exclusion-"));
  try {
    mkdirSync(join(root, "test"));
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "report"));
    writeFileSync(join(root, "test", "hosts.test.mjs"), `${fakeMachine} ${fakeIp}\nHiddenProject\n`);
    writeFileSync(join(root, "report", "run.md"), `${fakeIp}\n`);
    writeFileSync(join(root, "docs", "runbook.md"), `cd ${rootedSlash}\ncd ${outsidePath}\nip ${fakeIp}\n`);
    const keywords = [
      { id: "engagement-1", value: "hiddenproject" },
      { id: "machine-001", value: fakeMachine, category: "machine-name" },
    ];
    const findings = scanDirectory(root, keywords, {
      detectors: enabledBuiltinDetectors({}),
      exclusions: { workspaceRoots: normalizeWorkspaceRoots([fakeRoot]) },
    }).sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
    assert.deepEqual(findings, [
      { file: "docs/runbook.md", line: 2, keywordIds: ["local-path"], kinds: ["local-path"] },
      { file: "docs/runbook.md", line: 3, keywordIds: ["private-ip"], kinds: ["private-ip"] },
      { file: "test/hosts.test.mjs", line: 2, keywordIds: ["engagement-1"] },
    ]);
    const withoutExclusions = scanDirectory(root, keywords, { detectors: enabledBuiltinDetectors({}) });
    assert.equal(withoutExclusions.length, 6, "exclusions are opt-in for direct callers");
    assert.equal(JSON.stringify(findings).includes("Fictional"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keyword config reads workspaceRoots and rejects malformed roots", () => {
  const root = mkdtempSync(join(tmpdir(), "aiformat-leak-config-"));
  try {
    const path = join(root, "keywords.json");
    writeFileSync(path, JSON.stringify({ keywords: [], workspaceRoots: [fakeRoot] }));
    assert.deepEqual(loadKeywordConfig(path).workspaceRoots, [fakeRoot.toLowerCase()]);
    writeFileSync(path, JSON.stringify({ keywords: [] }));
    assert.deepEqual(loadKeywordConfig(path).workspaceRoots, []);
    writeFileSync(path, JSON.stringify({ keywords: [], workspaceRoots: ["Q:/"] }));
    assert.throws(() => loadKeywordConfig(path), /invalid root/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
