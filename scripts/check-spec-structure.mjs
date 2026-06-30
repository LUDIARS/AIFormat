#!/usr/bin/env node
/**
 * check-spec-structure — spec/ の構造規約を決定的に検査する CI ゲート
 * (HARNESS §2.3 / FORMAT_SPEC.md §1)
 *
 * FORMAT_SPEC.md が定める「spec/ は 6 分類フォルダのみ・直下に分類外を置かない」
 * を機械が落とす。判断を挟まず確実に違反といえるものだけを exit 1 にする:
 *
 *   - NONCANONICAL_DIR  spec/ 直下に 6 分類以外のフォルダ (例: spec/usage/)
 *   - STRAY_FILE        spec/ 直下に分類フォルダ外のファイル (README/index 索引は許容)
 *   - GITIGNORE_DATA    spec/data/ があるのに .gitignore の無アンカー `data/` が
 *                       それを無視している (spec/data/* が silently untracked になる)
 *
 * 「該当する分類が揃っているか (ドキュメント充実度)」は **該当性の判断** を伴うため
 * ここでは落とさない。それは REVIEW_QUALITY §3 / レビューの領分 (HARNESS の判断系)。
 * 欠けている分類は情報として表示するだけ。
 *
 * Usage:
 *   node check-spec-structure.mjs [repoDir]   # 既定は cwd
 *   node check-spec-structure.mjs --json
 *
 * exit: 0 = 問題なし(spec/ 不在も 0 扱い) / 1 = 違反あり
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const repoDir = args.find((a) => !a.startsWith("--")) || process.cwd();

// FORMAT_SPEC.md §1 の 7 分類。plan は作業ドキュメント、faq は調査・Q&A 蓄積。
const CANONICAL = new Set(["data", "faq", "feature", "interface", "plan", "setup", "test"]);
// spec/ 直下の索引ファイルは現実的に許容する (分類外ドキュメントではなくナビ)。
const ALLOWED_ROOT_FILES = new Set(["readme.md", "index.md"]);
// 充実度の評価対象 (plan を除く 5 分類)。欠落は「情報」止まり。
const EVALUATED = ["data", "feature", "interface", "setup", "test"];

function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function safeRead(p) { try { return readFileSync(p, "utf8"); } catch { return ""; } }

const specDir = join(repoDir, "spec");
const violations = [];

if (!existsSync(specDir) || !isDir(specDir)) {
  if (JSON_OUT) console.log(JSON.stringify({ spec: false, violations: [] }, null, 2));
  else console.log("check-spec-structure: spec/ が無い (スキップ)");
  process.exit(0);
}

const entries = readdirSync(specDir);
const presentDirs = [];

for (const name of entries) {
  const p = join(specDir, name);
  if (isDir(p)) {
    if (CANONICAL.has(name)) presentDirs.push(name);
    else
      violations.push({
        kind: "NONCANONICAL_DIR",
        path: relative(repoDir, p).replace(/\\/g, "/"),
        msg: `spec/ 直下の非正規フォルダ '${name}/' (FORMAT_SPEC §1: 6 分類のみ)`,
      });
  } else {
    if (!ALLOWED_ROOT_FILES.has(name.toLowerCase()))
      violations.push({
        kind: "STRAY_FILE",
        path: relative(repoDir, p).replace(/\\/g, "/"),
        msg: `spec/ 直下の分類外ファイル '${name}' (分類フォルダ配下へ移動)`,
      });
  }
}

// .gitignore の無アンカー `data/` が spec/data/ を巻き込む罠を検出。
const hasSpecData = existsSync(join(specDir, "data")) && isDir(join(specDir, "data"));
if (hasSpecData) {
  const gi = safeRead(join(repoDir, ".gitignore"));
  const trap = gi
    .split(/\r?\n/)
    .map((l) => l.trim())
    .some((l) => /^data\/?$/.test(l)); // 先頭スラッシュ無しの data / data/
  if (trap)
    violations.push({
      kind: "GITIGNORE_DATA",
      path: ".gitignore",
      msg: "無アンカー `data/` が spec/data/ を無視 (→ `/data/` にアンカー)",
    });
}

const missing = EVALUATED.filter((c) => !presentDirs.includes(c));

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { spec: true, present: presentDirs.sort(), missing, violations },
      null,
      2,
    ),
  );
} else {
  if (violations.length === 0)
    console.log(
      `check-spec-structure: OK (分類 ${presentDirs.sort().join("/") || "なし"}` +
        (missing.length ? ` / 未配置: ${missing.join(",")}` : "") +
        ")",
    );
  else {
    console.error(
      `check-spec-structure: ${violations.length} 件の違反 (FORMAT_SPEC §1)`,
    );
    for (const v of violations) console.error(`  ✗ ${v.path}: [${v.kind}] ${v.msg}`);
  }
  if (missing.length)
    console.log(
      `  i 未配置の分類: ${missing.join(", ")} ` +
        "(該当するなら追加。該当性の判断はレビュー領分なので CI では落とさない)",
    );
}

process.exit(violations.length > 0 ? 1 : 0);
