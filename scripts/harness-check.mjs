#!/usr/bin/env node
/**
 * harness-check — HARNESS の「CI ゲートで落とせる」ルールを一括検査する umbrella。
 *
 * 現状の決定的チェック:
 *   - check-migrations     (HARNESS §2.3 / RULE.md §2)
 *   - check-personal-data  (HARNESS §2.3 / RULE.md §5)
 *
 * いずれか 1 つでも違反すれば exit 1。CI の 1 ステップから呼ぶ。
 *
 * Usage:
 *   node harness-check.mjs [repoDir]   # 既定は cwd
 *   node harness-check.mjs --json
 *
 * 個別実行したい場合は check-migrations.mjs / check-personal-data.mjs を直接呼ぶ。
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const repoDir = args.find((a) => !a.startsWith("--")) || process.cwd();
const passthru = args.filter((a) => a.startsWith("--"));

const CHECKS = [
  { name: "migrations", script: "check-migrations.mjs" },
  { name: "personal-data", script: "check-personal-data.mjs" },
];

let failed = 0;
for (const c of CHECKS) {
  const r = spawnSync(process.execPath, [join(here, c.script), repoDir, ...passthru], {
    stdio: "inherit",
  });
  if (r.status !== 0) failed++;
}

if (failed === 0) console.log("\nharness-check: 全チェック OK");
else console.error(`\nharness-check: ${failed} 件のチェックが失敗`);

process.exit(failed > 0 ? 1 : 0);
