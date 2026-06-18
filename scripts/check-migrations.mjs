#!/usr/bin/env node
/**
 * check-migrations — マイグレーション禁止事項の CI ゲート (HARNESS §2.3 / RULE.md §2)
 *
 * `migrations/` 配下の SQL を走査し、以下を検出したら exit 1 で落とす:
 *   - DROP TABLE            (論理削除 is_active=false で代替)
 *   - DROP COLUMN           (データ保全のため残置)
 *   - ALTER COLUMN ... TYPE (型変更は新カラム追加で対応)
 *   - マイグレーション番号の重複 ({番号}_{説明}.sql の先頭番号)
 *
 * これらは「記憶」で守るのではなく機械が決定的に落とす (HARNESS の仕組み化原則)。
 *
 * Usage:
 *   node check-migrations.mjs [repoDir]      # 既定は cwd
 *   node check-migrations.mjs --dir <path>   # migrations ルートを明示
 *   node check-migrations.mjs --json
 *
 * exit: 0 = 問題なし / 1 = 違反あり / 2 = 走査対象なし(migrations 不在は 0 扱い)
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, relative } from "node:path";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const dirFlag = args.indexOf("--dir");
const explicitDir = dirFlag >= 0 ? args[dirFlag + 1] : null;
const repoDir = explicitDir
  ? null
  : args.find((a) => !a.startsWith("--")) || process.cwd();

// migrations ディレクトリを探す (repo 直下 / 任意 1 階層下の migrations)。
function findMigrationDirs(root) {
  const found = [];
  const direct = join(root, "migrations");
  if (existsSync(direct) && statSync(direct).isDirectory()) found.push(direct);
  // apps/*/migrations, packages/*/migrations, server/migrations 等も拾う
  for (const sub of safeReaddir(root)) {
    const subPath = join(root, sub);
    if (!isDir(subPath) || sub === "node_modules" || sub.startsWith(".")) continue;
    const nested = join(subPath, "migrations");
    if (existsSync(nested) && isDir(nested)) found.push(nested);
    // 2 階層目 (apps/server/migrations 等)
    for (const sub2 of safeReaddir(subPath)) {
      const p2 = join(subPath, sub2, "migrations");
      if (isDir(subPath) && existsSync(p2) && isDir(p2)) found.push(p2);
    }
  }
  return [...new Set(found)];
}

function safeReaddir(p) { try { return readdirSync(p); } catch { return []; } }
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

function sqlFiles(dir) {
  return safeReaddir(dir)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .map((f) => join(dir, f));
}

// コメント・文字列を雑に除去してから禁止句を当てる (誤検出低減)。
function stripNoise(sql) {
  return sql
    .replace(/--[^\n]*/g, " ")        // 行コメント
    .replace(/\/\*[\s\S]*?\*\//g, " ") // ブロックコメント
    .replace(/'(?:[^'\\]|\\.)*'/g, "''"); // 文字列リテラル
}

const RULES = [
  { id: "DROP_TABLE", re: /\bDROP\s+TABLE\b/i, msg: "DROP TABLE 禁止 (論理削除 is_active=false で代替)" },
  { id: "DROP_COLUMN", re: /\bDROP\s+COLUMN\b/i, msg: "DROP COLUMN 禁止 (データ保全のため残置)" },
  { id: "ALTER_TYPE", re: /\bALTER\s+(?:COLUMN\s+)?\w+\s+(?:SET\s+DATA\s+)?TYPE\b/i, msg: "ALTER COLUMN ... TYPE 禁止 (新カラム追加で対応)" },
];

const violations = [];
const dirs = explicitDir ? [explicitDir] : findMigrationDirs(repoDir);
let scanned = 0;
const numbers = new Map(); // dir 内の連番重複検出

for (const dir of dirs) {
  for (const file of sqlFiles(dir)) {
    scanned++;
    const rel = relative(repoDir || explicitDir || ".", file);
    const raw = readFileSync(file, "utf8");
    const sql = stripNoise(raw);
    for (const rule of RULES) {
      if (rule.re.test(sql)) violations.push({ file: rel, rule: rule.id, msg: rule.msg });
    }
    // 連番重複: 先頭の数字列をキーに
    const m = basename(file).match(/^(\d+)/);
    if (m) {
      const key = `${dir}#${m[1]}`;
      if (numbers.has(key)) {
        violations.push({ file: rel, rule: "DUP_NUMBER", msg: `マイグレーション番号 ${m[1]} が重複 (${basename(numbers.get(key))})` });
      } else {
        numbers.set(key, file);
      }
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned, dirs, violations }, null, 2));
} else if (scanned === 0) {
  console.log("check-migrations: migrations が見つからない (スキップ)");
} else if (violations.length === 0) {
  console.log(`check-migrations: OK (${scanned} ファイル走査, 違反なし)`);
} else {
  console.error(`check-migrations: ${violations.length} 件の違反 (HARNESS §2.3 / RULE.md §2)`);
  for (const v of violations) console.error(`  ✗ ${v.file}: [${v.rule}] ${v.msg}`);
}

process.exit(violations.length > 0 ? 1 : 0);
