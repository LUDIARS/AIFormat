#!/usr/bin/env node
/**
 * check-latest-json — review/<YYYY-MM-DD>/latest.json のスキーマを決定的に検査する CI ゲート
 * (HARNESS「強制できるものは記憶に頼らない」/ REVIEW.md「成果物の配置と latest.json」)
 *
 * latest.json は機械処理用サマリなのに、これまで機械が守っていなかった穴を塞ぐ。
 * 判断を挟まず確実に違反といえるものだけを exit 1 にする:
 *
 *   - PARSE_ERROR      JSON として読めない
 *   - MISSING_LATEST   日付ディレクトリに latest.json が無い (REVIEW.md: 併置必須)
 *   - MISSING_FIELD    必須フィールドの欠落 (date/repo/style/weighted_score/scores/
 *                      critical_count/high_count/autofix_count/autofix_categories/fix_pr)
 *   - DATE_MISMATCH    date とディレクトリ名の不一致
 *   - BAD_STYLE        style が web / local-app / game / common-only 以外
 *   - BAD_GRADE        weighted_score が A〜D 以外
 *   - BAD_SCORE        scores が空、または値が A〜D / null 以外
 *   - BAD_COUNT        *_count / autofix_categories の値が非負整数でない
 *
 * scores のキーがスタイルの総合評価表と一致するか (観点の過不足) は、スタイル判定
 * という**該当性の判断**を伴うためここでは落とさない。それはレビュー領分
 * (REVIEW_PROMPT.md Phase 5 の整合検査)。
 *
 * Usage:
 *   node check-latest-json.mjs [repoDir]   # 既定は cwd
 *   node check-latest-json.mjs --json
 *
 * exit: 0 = 問題なし (review/ 不在も 0 扱い) / 1 = 違反あり
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const repoDir = args.find((a) => !a.startsWith("--")) || process.cwd();

const STYLES = new Set(["web", "local-app", "game", "common-only"]);
const GRADES = new Set(["A", "B", "C", "D"]);
const REQUIRED = [
  "date",
  "repo",
  "style",
  "weighted_score",
  "scores",
  "critical_count",
  "high_count",
  "autofix_count",
  "autofix_categories",
  "fix_pr",
];
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function isNonNegInt(v) { return Number.isInteger(v) && v >= 0; }

const reviewDir = join(repoDir, "review");
const violations = [];
const checked = [];

if (!existsSync(reviewDir) || !isDir(reviewDir)) {
  if (JSON_OUT) console.log(JSON.stringify({ review: false, violations: [] }, null, 2));
  else console.log("check-latest-json: review/ が無い (スキップ)");
  process.exit(0);
}

for (const name of readdirSync(reviewDir)) {
  const dir = join(reviewDir, name);
  if (!isDir(dir) || !DATE_DIR.test(name)) continue;

  const file = join(dir, "latest.json");
  const rel = relative(repoDir, file).replace(/\\/g, "/");
  checked.push(rel);

  if (!existsSync(file)) {
    violations.push({ kind: "MISSING_LATEST", path: rel, msg: "latest.json が無い (REVIEW.md: 成果物に併置必須)" });
    continue;
  }

  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    violations.push({ kind: "PARSE_ERROR", path: rel, msg: `JSON parse 失敗: ${e.message}` });
    continue;
  }

  for (const f of REQUIRED)
    if (!(f in data))
      violations.push({ kind: "MISSING_FIELD", path: rel, msg: `必須フィールド '${f}' が無い` });

  if (typeof data.date === "string" && data.date !== name)
    violations.push({ kind: "DATE_MISMATCH", path: rel, msg: `date '${data.date}' がディレクトリ名 '${name}' と不一致` });

  if ("style" in data && !STYLES.has(data.style))
    violations.push({ kind: "BAD_STYLE", path: rel, msg: `style '${data.style}' は web / local-app / game / common-only のいずれかにする` });

  if ("weighted_score" in data && !GRADES.has(data.weighted_score))
    violations.push({ kind: "BAD_GRADE", path: rel, msg: `weighted_score '${data.weighted_score}' は A〜D にする` });

  if ("scores" in data) {
    if (typeof data.scores !== "object" || data.scores === null || Array.isArray(data.scores) || Object.keys(data.scores).length === 0) {
      violations.push({ kind: "BAD_SCORE", path: rel, msg: "scores は 1 観点以上のオブジェクトにする" });
    } else {
      for (const [k, v] of Object.entries(data.scores))
        if (v !== null && !GRADES.has(v))
          violations.push({ kind: "BAD_SCORE", path: rel, msg: `scores.${k} = '${v}' は A〜D または null (対象外) にする` });
    }
  }

  for (const f of ["critical_count", "high_count", "autofix_count"])
    if (f in data && !isNonNegInt(data[f]))
      violations.push({ kind: "BAD_COUNT", path: rel, msg: `${f} は非負整数にする` });

  if ("autofix_categories" in data && typeof data.autofix_categories === "object" && data.autofix_categories !== null)
    for (const [k, v] of Object.entries(data.autofix_categories))
      if (!isNonNegInt(v))
        violations.push({ kind: "BAD_COUNT", path: rel, msg: `autofix_categories.${k} は非負整数にする` });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ review: true, checked, violations }, null, 2));
} else if (violations.length === 0) {
  console.log(`check-latest-json: OK (${checked.length} 件検査)`);
} else {
  console.error(`check-latest-json: ${violations.length} 件の違反 (REVIEW.md「成果物の配置と latest.json」)`);
  for (const v of violations) console.error(`  ✗ ${v.path}: [${v.kind}] ${v.msg}`);
}

process.exit(violations.length > 0 ? 1 : 0);
