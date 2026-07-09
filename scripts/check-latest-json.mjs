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
 *   - MISSING_FIELD    format_version 無し (2026-07-09 以降の date のみ必須。旧成果物は legacy 扱い)
 *   - BAD_FORMAT_VERSION  format_version が 2 未満・非整数
 *   - SCORES_KEYS_MISMATCH  format_version >= 2 で、scores キーが scores-keys.json の
 *                       該当スタイルのキー列と (順序含め) 一致しない
 *
 * scores キーの正本は scores-keys.json (スタイル総合評価表と同時更新)。これにより
 * 「観点キーの過不足」はスタイル判定済みの成果物に対して決定的に検査できる。
 * スタイル判定そのものの妥当性はレビュー領分 (prompt/REVIEW_FULL.md Phase 0)。
 *
 * Usage:
 *   node check-latest-json.mjs [repoDir]   # 既定は cwd
 *   node check-latest-json.mjs --json
 *
 * exit: 0 = 問題なし (review/ 不在も 0 扱い) / 1 = 違反あり
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
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
// format_version (と scores キー突合) を必須にする採用日。これより古い成果物は legacy 扱い。
const FORMAT_VERSION_SINCE = "2026-07-09";

function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function isNonNegInt(v) { return Number.isInteger(v) && v >= 0; }

let SCORES_KEYS = null;
try {
  SCORES_KEYS = JSON.parse(readFileSync(join(here, "scores-keys.json"), "utf8"));
} catch {
  SCORES_KEYS = null; // 正本が無い環境ではキー突合をスキップ (他チェックは実施)
}

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

  // format_version: 採用日以降の成果物は必須。format_version >= 2 なら scores キーを正本と突合する。
  if (!("format_version" in data)) {
    if (typeof data.date === "string" && data.date >= FORMAT_VERSION_SINCE)
      violations.push({ kind: "MISSING_FIELD", path: rel, msg: `必須フィールド 'format_version' が無い (${FORMAT_VERSION_SINCE} 以降のレビューは必須)` });
    // 旧成果物は legacy としてキー突合をスキップ
  } else if (!Number.isInteger(data.format_version) || data.format_version < 2) {
    violations.push({ kind: "BAD_FORMAT_VERSION", path: rel, msg: `format_version '${data.format_version}' は 2 以上の整数にする` });
  } else if (SCORES_KEYS && STYLES.has(data.style) && data.scores && typeof data.scores === "object" && !Array.isArray(data.scores)) {
    const canonical = SCORES_KEYS.styles?.[data.style];
    if (Array.isArray(canonical)) {
      const actual = Object.keys(data.scores);
      const mismatch =
        actual.length !== canonical.length || canonical.some((k, i) => actual[i] !== k);
      if (mismatch)
        violations.push({
          kind: "SCORES_KEYS_MISMATCH",
          path: rel,
          msg: `scores キーが scores-keys.json の '${data.style}' (${canonical.length} 観点・順序込み) と不一致`,
        });
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
