#!/usr/bin/env node
/**
 * check-personal-data — 個人データ非保管の CI ゲート (HARNESS §2.3 / RULE.md §5)
 *
 * 各サービス DB に個人データ列を持たせない (Cernere が単一情報源)。
 * migrations / schema SQL に以下の列が CREATE/ADD されていたら exit 1:
 *   display_name, email, password_hash, password, salt,
 *   refresh_token, access_token, last_login_at, google_*, github_*
 *
 * 注: 汎用すぎて誤検出が多い列 (`name` = 場所名/タグ名等, `role` = ゲーム内ロール等)
 * は CI ゲートからは意図的に外す。CI は「ほぼ確実に個人データ」な列だけを決定的に
 * 落とし、グレーな列はレビュー/HARNESS で判断する (ゲートを形骸化させないため)。
 *
 * FK アンカー (`user_id` 等の *_id) は許可。Cernere 本体・明示 allowlist も除外。
 * 誤検出は各リポ直下 `.harness-allow-personal-data.json` の `columns`/`files` で抑制。
 *
 * Usage:
 *   node check-personal-data.mjs [repoDir]
 *   node check-personal-data.mjs --json
 *
 * exit: 0 = OK / 1 = 違反あり
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, basename, resolve } from "node:path";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const repoDir = args.find((a) => !a.startsWith("--")) || process.cwd();
// 絶対パス化してから Cernere 判定する (CI は repoDir="." で渡るため、相対のままだと
// basename が "." になり Cernere スキップが効かず正当な個人データ列を誤検出する)。
const repoAbs = resolve(repoDir);

// 列名だけでは個人データか判定できない (同じ display_name でも users テーブルなら
// 個人データ、interviewer_personas なら AI ペルソナ名で別物)。そこで 2 段階で見る:
//
// 1. 認証クレデンシャル — テーブル無関係で常に NG。これらが各サービス DB に
//    出ること自体が誤り (ペルソナ/NPC がパスワードや OAuth トークンを持たない)。
const CREDENTIAL = new Set([
  "password_hash", "password", "salt",
  "refresh_token", "access_token", "last_login_at",
]);
const CREDENTIAL_PREFIX = ["google_", "github_"];

// 2. 実ユーザ系テーブルに載るときのみ NG な列 (それ以外の文脈では正当)。
const USER_TABLE_ONLY = new Set(["email", "display_name"]);
// 実ユーザを表すテーブル名 (これに該当する時だけ USER_TABLE_ONLY を NG にする)。
const USER_TABLE_RE = /(^|_)(users?|accounts?|members?|profiles?)(_|$)/i;

// allowlist (誤検出抑制 + Cernere 本体除外)
function loadAllow() {
  const f = join(repoDir, ".harness-allow-personal-data.json");
  if (!existsSync(f)) return { columns: [], files: [] };
  try {
    const j = JSON.parse(readFileSync(f, "utf8"));
    return { columns: (j.columns || []).map((c) => c.toLowerCase()), files: j.files || [] };
  } catch { return { columns: [], files: [] }; }
}
const allow = loadAllow();
// Cernere は個人データの正本なので自身は対象外
const isCernere = /(^|[\/\\])Cernere([\/\\]|$)/i.test(repoAbs) || basename(repoAbs).toLowerCase() === "cernere";

function safeReaddir(p) { try { return readdirSync(p); } catch { return []; } }
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

// migrations/ と spec/data/ 配下、*.sql を再帰収集 (node_modules / .git 除外)。
function collectSql(root, depth = 0) {
  const out = [];
  if (depth > 4) return out;
  for (const name of safeReaddir(root)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = join(root, name);
    if (isDir(p)) out.push(...collectSql(p, depth + 1));
    else if (name.toLowerCase().endsWith(".sql")) out.push(p);
  }
  return out;
}

function stripNoise(sql) {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

// CREATE TABLE の列定義 / ADD COLUMN から {table, column} を抜き出す。
function extractColumnDefs(sql) {
  const defs = [];
  // ALTER TABLE <table> ... ADD COLUMN [IF NOT EXISTS] <name>
  for (const m of sql.matchAll(/\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?[\s\S]*?\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi)) {
    defs.push({ table: m[1], column: m[2] });
  }
  // CREATE TABLE <table> ( ... )
  for (const t of sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\)\s*;/gi)) {
    const table = t[1];
    for (const line of t[2].split(",")) {
      const m = line.trim().match(/^["`]?(\w+)["`]?\s+\w/);
      if (m) defs.push({ table, column: m[1] });
    }
  }
  return defs;
}

// 個人データ列か判定。理由 (credential / user-table) も返す。
function classify(table, col) {
  const c = col.toLowerCase();
  if (c.endsWith("_id") || c === "id") return null;     // FK アンカーは許可
  if (allow.columns.includes(c)) return null;
  if (CREDENTIAL.has(c) || CREDENTIAL_PREFIX.some((p) => c.startsWith(p))) {
    return "credential";                                 // テーブル無関係で NG
  }
  if (USER_TABLE_ONLY.has(c) && USER_TABLE_RE.test(table)) {
    return "user-table";                                 // 実ユーザ系テーブルのみ NG
  }
  return null;
}

const violations = [];
if (!isCernere) {
  for (const file of collectSql(repoDir)) {
    const rel = relative(repoDir, file).replace(/\\/g, "/");
    if (allow.files.some((f) => rel === f || rel.startsWith(f))) continue;
    const sql = stripNoise(readFileSync(file, "utf8"));
    for (const { table, column } of extractColumnDefs(sql)) {
      const reason = classify(table, column);
      if (reason) violations.push({ file: rel, table, column, reason });
    }
  }
}

// 重複圧縮
const uniq = [...new Map(violations.map((v) => [`${v.file}#${v.table}.${v.column}`, v])).values()];

if (JSON_OUT) {
  console.log(JSON.stringify({ repo: repoDir, cernereSkipped: isCernere, violations: uniq }, null, 2));
} else if (isCernere) {
  console.log("check-personal-data: Cernere は個人データの正本のためスキップ");
} else if (uniq.length === 0) {
  console.log("check-personal-data: OK (個人データ列なし)");
} else {
  console.error(`check-personal-data: ${uniq.length} 件の個人データ列 (HARNESS §2.3 / RULE.md §5)`);
  for (const v of uniq) {
    const why = v.reason === "credential"
      ? "認証クレデンシャルは Cernere の責務"
      : "実ユーザ系テーブルの個人データは Cernere に集約";
    console.error(`  ✗ ${v.file}: ${v.table}.${v.column} — ${why} (FK の *_id のみ保持可)`);
  }
  console.error("  誤検出なら .harness-allow-personal-data.json の columns/files で抑制");
}

process.exit(uniq.length > 0 ? 1 : 0);
