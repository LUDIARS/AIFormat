import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  activeDetectors,
  activeKeywords,
  countByKind,
  countByRepositoryAndKind,
  partitionFindings,
} from "./category-policy.mjs";
import { loadKeywordConfig } from "./keyword-config.mjs";
import { createTextScanner } from "./scanner.mjs";

// 架空の値を組み立てて使う (このリポジトリ自身で検査が反応しないように)。
const fakeIp = ["10", "20", "30", "40"].join(".");
const fakePath = ["Q:", "Fictional", "Place"].join("/");
const fakeMachine = ["zz", "host", "77"].join("-");

test("reports detector hits by kind and id without the matched value", () => {
  const scan = createTextScanner(
    [{ id: "machine-001", value: fakeMachine, match: "substring", category: "machine-name" }],
    { detectors: activeDetectors({}) },
  );
  const findings = scan("docs/runbook.md", `ssh ${fakeMachine} ${fakeIp}\ncd ${fakePath}\nplain`);
  assert.deepEqual(findings, [
    { file: "docs/runbook.md", line: 1, keywordIds: ["machine-001", "private-ip"], kinds: ["machine-name", "private-ip"] },
    { file: "docs/runbook.md", line: 2, keywordIds: ["local-path"], kinds: ["local-path"] },
  ]);
  const serialized = JSON.stringify(findings);
  for (const value of [fakeIp, fakeMachine, "Fictional"]) assert.equal(serialized.includes(value), false);
});

test("legacy keyword findings keep their shape and stay gating; new kinds default to advisory", () => {
  const scan = createTextScanner([{ id: "product-001", value: "SecretTitle", match: "substring" }], {
    detectors: activeDetectors({}),
  });
  const [legacy, detected] = scan("a.md", `SecretTitle\nhost ${fakeIp}`);
  assert.deepEqual(legacy, { file: "a.md", line: 1, keywordIds: ["product-001"] });
  const { enforced, advisory } = partitionFindings([legacy, detected], {});
  assert.deepEqual(enforced, [legacy]);
  assert.deepEqual(advisory, [detected]);
  assert.deepEqual(partitionFindings([detected], { "private-ip": "enforce" }).enforced, [detected]);
});

test("off removes a kind from scanning", () => {
  assert.deepEqual(activeDetectors({ "local-path": "off" }).map(({ id }) => id), ["private-ip"]);
  const keywords = [
    { id: "a", value: "x1", match: "substring", category: "site-name" },
    { id: "b", value: "x2", match: "substring" },
  ];
  assert.deepEqual(activeKeywords(keywords, { "site-name": "off" }).map(({ id }) => id), ["b"]);
});

test("counts findings by kind and by repository", () => {
  const findings = [
    { repository: "Org/B", kinds: ["private-ip", "local-path"] },
    { repository: "Org/A", kinds: ["local-path"] },
    { repository: "Org/A" },
  ];
  assert.deepEqual(countByKind(findings), { keyword: 1, "local-path": 2, "private-ip": 1 });
  assert.deepEqual(countByRepositoryAndKind(findings), {
    "Org/A": { "local-path": 1, keyword: 1 },
    "Org/B": { "private-ip": 1, "local-path": 1 },
  });
});

test("the keyword config carries categories and rejects unknown ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "leak-category-"));
  try {
    const good = join(dir, "good.json");
    writeFileSync(good, JSON.stringify({
      keywords: [{ id: "site-001", value: "zz-site", category: "site-name" }],
      categories: { "private-ip": "enforce" },
    }));
    const config = loadKeywordConfig(good);
    assert.equal(config.keywords[0].category, "site-name");
    assert.equal(config.categories["private-ip"], "enforce");
    assert.equal(config.categories["local-path"], "advisory");

    const badCategory = join(dir, "bad-category.json");
    writeFileSync(badCategory, JSON.stringify({ keywords: [{ id: "x", value: "y", category: "hostname" }] }));
    assert.throws(() => loadKeywordConfig(badCategory), /Invalid keyword category/);

    const badMode = join(dir, "bad-mode.json");
    writeFileSync(badMode, JSON.stringify({ keywords: [], categories: { "private-ip": "warn" } }));
    assert.throws(() => loadKeywordConfig(badMode), /advisory, enforce, or off/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
