#!/usr/bin/env node
/**
 * infisical-setup — LUDIARS 全 repo 横断の Infisical 環境変数対話セットアップ
 *
 * Usage:
 *   node infisical-setup.mjs           # 対話モード
 *   node infisical-setup.mjs --dry-run # 書き込まず diff だけ表示
 *   node infisical-setup.mjs --list    # 対象 repo 一覧と現状値だけ表示
 *
 * 設計:
 *   共通 (SITE_URL / CLIENT_ID / CLIENT_SECRET / ENVIRONMENT) は
 *   $BASE_DIR/.env.shared.secrets に 1 箇所集約。
 *   各 repo の .env.secrets には INFISICAL_PROJECT_ID のみ残す。
 *
 *   各 repo の dev スクリプトに `--env-file-if-exists=../.env.shared.secrets`
 *   が無いと共有ファイルを読まないが、 ここでは package.json は触らない
 *   (--list が「shared 未参照」 を検出してレポート、 patch は別ツール)。
 *
 * 既存値の扱い:
 *   - shared / 各 repo の現状値を読み取りプロンプトのデフォルトに使う
 *   - 上書き前に .env.secrets → .env.secrets.bak にバックアップ
 *     (.bak が既にあれば二重バックアップしない)
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { resolveWorkspaceRoot } from "./lib/workspace-root.mjs";

const BASE_DIR = resolveWorkspaceRoot();
const SHARED_PATH = join(BASE_DIR, ".env.shared.secrets");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIST_ONLY = args.includes("--list");

const SHARED_KEYS = [
  "INFISICAL_SITE_URL",
  "INFISICAL_ENVIRONMENT",
  "INFISICAL_CLIENT_ID",
  "INFISICAL_CLIENT_SECRET",
];
const PER_REPO_KEYS = ["INFISICAL_PROJECT_ID"];
const SECRET_KEYS = new Set(["INFISICAL_CLIENT_SECRET"]);

const SHARED_DEFAULTS = {
  INFISICAL_SITE_URL: "https://infisical.vtn-game.com",
  INFISICAL_ENVIRONMENT: "dev",
};

/** "KEY=VALUE" 形式のシンプルパーサ (.env)。 quotes は剥がす。 export 接頭辞は無視。 */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return parseEnv(readFileSync(path, "utf-8"));
}

function maskSecret(value) {
  if (!value) return "(未設定)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

function maskNonSecret(value) {
  return value || "(未設定)";
}

/** Ars 配下で env-cli.config.ts を持つディレクトリを列挙。 */
function findRepos() {
  const entries = readdirSync(BASE_DIR, { withFileTypes: true });
  const repos = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue;
    const dir = join(BASE_DIR, e.name);
    if (!existsSync(join(dir, "env-cli.config.ts"))) continue;
    repos.push({ name: e.name, dir });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

/** package.json の dev/start スクリプトが `../.env.shared.secrets` を読むか判定。 */
function packageReadsShared(repoDir) {
  const pkgPath = join(repoDir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};
    return Object.values(scripts).some(
      (s) => typeof s === "string" && s.includes(".env.shared.secrets"),
    );
  } catch {
    return false;
  }
}

function renderEnvFile(keyValueMap, order) {
  const lines = order
    .filter((k) => keyValueMap[k] !== undefined && keyValueMap[k] !== "")
    .map((k) => `${k}=${keyValueMap[k]}`);
  return lines.join("\n") + "\n";
}

function backup(path) {
  if (!existsSync(path)) return null;
  const bak = `${path}.bak`;
  if (existsSync(bak)) return bak; // 既存 .bak は保護
  renameSync(path, bak);
  return bak;
}

function writeFileSafe(path, content) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would write ${path}:`);
    for (const line of content.split("\n")) {
      if (!line) continue;
      const [k, ...rest] = line.split("=");
      const v = rest.join("=");
      const shown = SECRET_KEYS.has(k) ? maskSecret(v) : maskNonSecret(v);
      console.log(`    ${k}=${shown}`);
    }
    return;
  }
  writeFileSync(path, content, { encoding: "utf-8" });
}

async function promptValue(rl, key, currentValue) {
  const isSecret = SECRET_KEYS.has(key);
  const shown = isSecret ? maskSecret(currentValue) : maskNonSecret(currentValue);
  const fallback = SHARED_DEFAULTS[key];
  const fallbackHint = !currentValue && fallback ? ` [既定: ${fallback}]` : "";
  const answer = await rl.question(`  ${key} (現状: ${shown})${fallbackHint}: `);
  const trimmed = answer.trim();
  if (!trimmed) return currentValue || fallback || "";
  return trimmed;
}

async function runListOnly() {
  const repos = findRepos();
  const shared = readEnvFile(SHARED_PATH);
  console.log(`Shared (${SHARED_PATH}):`);
  for (const k of SHARED_KEYS) {
    const v = shared[k];
    console.log(`  ${k} = ${SECRET_KEYS.has(k) ? maskSecret(v) : maskNonSecret(v)}`);
  }
  console.log();
  console.log(`Repos (${repos.length}):`);
  for (const r of repos) {
    const repoSecrets = readEnvFile(join(r.dir, ".env.secrets"));
    const pid = repoSecrets.INFISICAL_PROJECT_ID;
    const sharedRef = packageReadsShared(r.dir) ? "ok" : "MISSING";
    const overlap = SHARED_KEYS.filter((k) => repoSecrets[k]);
    const overlapNote = overlap.length ? ` ⚠ shared keys in repo: ${overlap.join(",")}` : "";
    console.log(
      `  ${r.name.padEnd(22)} PROJECT_ID=${maskNonSecret(pid).slice(0, 36)}  pkg.json shared-ref=${sharedRef}${overlapNote}`,
    );
  }
}

async function runInteractive() {
  const repos = findRepos();
  console.log(`LUDIARS_BASE: ${BASE_DIR}`);
  console.log(`Shared file:  ${SHARED_PATH}`);
  console.log(`対象 repo:    ${repos.length} 件`);
  console.log();

  const rl = createInterface({ input, output });

  // --- 1) shared ---
  const sharedCurrent = readEnvFile(SHARED_PATH);
  console.log("[1/2] 共通 machine identity (Ars/.env.shared.secrets)");
  console.log("      未入力 Enter で現状値を維持。");
  const sharedNew = {};
  for (const k of SHARED_KEYS) {
    sharedNew[k] = await promptValue(rl, k, sharedCurrent[k]);
  }
  console.log();

  // --- 2) per-repo PROJECT_ID ---
  console.log("[2/2] 各 repo の INFISICAL_PROJECT_ID");
  console.log("      空のままなら .env.secrets を空ファイル化 (= shared だけで動作)。");
  const repoPlans = [];
  for (const r of repos) {
    const cur = readEnvFile(join(r.dir, ".env.secrets"));
    const pid = await promptValue(rl, `${r.name} / INFISICAL_PROJECT_ID`, cur.INFISICAL_PROJECT_ID);
    repoPlans.push({ ...r, projectId: pid });
  }
  rl.close();
  console.log();

  // --- 書き出し ---
  console.log("[書き出し]");
  const sharedContent = renderEnvFile(sharedNew, SHARED_KEYS);
  const sharedBak = backup(SHARED_PATH);
  if (sharedBak) console.log(`  backup: ${sharedBak}`);
  writeFileSafe(SHARED_PATH, sharedContent);
  if (!DRY_RUN) console.log(`  wrote:  ${SHARED_PATH}`);

  for (const r of repoPlans) {
    const target = join(r.dir, ".env.secrets");
    const bak = backup(target);
    if (bak && !DRY_RUN) console.log(`  backup: ${bak}`);
    const content = renderEnvFile({ INFISICAL_PROJECT_ID: r.projectId }, PER_REPO_KEYS);
    writeFileSafe(target, content);
    if (!DRY_RUN) console.log(`  wrote:  ${target} (PROJECT_ID=${maskNonSecret(r.projectId).slice(0, 36)})`);
  }
  console.log();

  // --- pkg.json 参照チェック ---
  const missing = repoPlans.filter((r) => !packageReadsShared(r.dir));
  if (missing.length) {
    console.log("⚠ 以下の repo は dev スクリプトに `--env-file-if-exists=../.env.shared.secrets` が無いため、");
    console.log("  共有ファイルを読まない。 package.json を編集する必要があります:");
    for (const r of missing) console.log(`  - ${r.name}/package.json`);
    console.log();
    console.log("  各スクリプトに追加する形 (Bibliotheca / Aedilis 例):");
    console.log(`    "dev": "tsx watch --env-file-if-exists=../.env.shared.secrets \\`);
    console.log("                    --env-file-if-exists=.env.secrets \\");
    console.log("                    --env-file-if-exists=.env server/bootstrap.ts\"");
  } else {
    console.log("✓ 全 repo の package.json が ../.env.shared.secrets を参照済");
  }
}

async function main() {
  if (LIST_ONLY) {
    await runListOnly();
    return;
  }
  await runInteractive();
}

main().catch((e) => {
  console.error(`[infisical-setup] error:`, e);
  process.exit(1);
});
