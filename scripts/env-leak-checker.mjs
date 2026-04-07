#!/usr/bin/env node
/**
 * env-leak-checker — リポジトリ内の環境名・個人名漏洩チェッカー
 *
 * 設定ファイル (.env.example 等) を除く全ファイルを grep し、
 * 登録済みキーワードが含まれていないかを検出する。
 *
 * CLI モード:
 *   node env-leak-checker.mjs scan [repo_path]
 *   node env-leak-checker.mjs list
 *   node env-leak-checker.mjs add <keyword>
 *   node env-leak-checker.mjs remove <keyword>
 *
 * GUI モード:
 *   node env-leak-checker.mjs serve [--port 7700]
 *   → ブラウザで http://localhost:7700 を開く
 */

import { createServer } from "node:http";
import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "env-leak-keywords.json");
const BASE_DIR = process.env.LUDIARS_BASE || "<workspace-root>";

let VERBOSE = false;

function log(...args) {
  if (VERBOSE) console.log("[v]", ...args);
}

// ── キーワード管理 ────────────────────────────────────────

function loadKeywords() {
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify({ keywords: [], ignore_patterns: [] }, null, 2));
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function saveKeywords(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

// ── 除外パターン ──────────────────────────────────────────

const DEFAULT_IGNORE_GLOBS = [
  ".env*",
  "*.lock",
  "*.min.js",
  "*.min.css",
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  "target/**",
  "*.wasm",
  "*.png",
  "*.jpg",
  "*.ico",
  "*.woff*",
  "*.ttf",
  "*.otf",
  "*.db",
  "*.db-*",
  "*.sqlite",
  "package-lock.json",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "env-leak-keywords.json",
];

// ── スキャン実行 ──────────────────────────────────────────

function scanRepo(repoPath, keywords) {
  if (!keywords.length) return [];

  const repoName = basename(repoPath);
  log(`Scanning: ${repoName} (${repoPath})`);

  const excludeArgs = DEFAULT_IGNORE_GLOBS.map(
    (g) => `--exclude=${g}`
  ).join(" ");
  const excludeDirArgs = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    "__pycache__",
    "venv",
  ]
    .map((d) => `--exclude-dir=${d}`)
    .join(" ");

  const pattern = keywords.map((k) => escapeRegex(k)).join("|");
  const cmd = `grep -rniE "${pattern}" ${excludeArgs} ${excludeDirArgs} .`;
  log(`  cmd: ${cmd}`);

  const t0 = performance.now();
  const results = [];
  try {
    const output = execSync(cmd, {
        cwd: repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
      if (!match) continue;

      const [, file, lineNum, content] = match;
      // どのキーワードにヒットしたか特定
      const matched = keywords.filter((kw) =>
        content.toLowerCase().includes(kw.toLowerCase())
      );

      results.push({
        file,
        line: parseInt(lineNum, 10),
        content: content.trim().slice(0, 200),
        keywords: matched,
      });
    }
  } catch (err) {
    // grep が何もヒットしないと exit code 1 で返る
    if (err.status !== 1) {
      console.error(`Scan error in ${repoPath}: ${err.message}`);
    }
  }

  const elapsed = (performance.now() - t0).toFixed(0);
  log(`  ${repoName}: ${results.length} hit(s) in ${elapsed}ms`);

  return results;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── LUDIARS リポジトリ列挙 ────────────────────────────────

function listRepos() {
  const repos = [];
  for (const name of readdirSync(BASE_DIR)) {
    const full = join(BASE_DIR, name);
    try {
      if (!statSync(full).isDirectory()) continue;
      if (!existsSync(join(full, ".git"))) continue;
      repos.push({ name, path: full });
    } catch {
      // skip
    }
  }
  return repos;
}

// ── CLI モード ────────────────────────────────────────────

function runCli(args) {
  const cmd = args[0];
  const config = loadKeywords();

  switch (cmd) {
    case "list": {
      console.log("Keywords:", config.keywords.length ? "" : "(none)");
      for (const kw of config.keywords) console.log(`  - ${kw}`);
      break;
    }

    case "add": {
      const kw = args.slice(1).join(" ");
      if (!kw) {
        console.error("Usage: add <keyword>");
        process.exit(1);
      }
      if (!config.keywords.includes(kw)) {
        config.keywords.push(kw);
        saveKeywords(config);
        console.log(`Added: "${kw}"`);
      } else {
        console.log(`Already exists: "${kw}"`);
      }
      break;
    }

    case "remove": {
      const kw = args.slice(1).join(" ");
      const idx = config.keywords.indexOf(kw);
      if (idx >= 0) {
        config.keywords.splice(idx, 1);
        saveKeywords(config);
        console.log(`Removed: "${kw}"`);
      } else {
        console.log(`Not found: "${kw}"`);
      }
      break;
    }

    case "scan": {
      const remaining = args.slice(1).filter((a) => a !== "-v");
      const target = remaining[0] || BASE_DIR;
      if (config.keywords.length === 0) {
        console.log("No keywords registered. Use 'add' to register.");
        return;
      }

      console.log(`Keywords: ${config.keywords.join(", ")}`);

      if (existsSync(join(target, ".git"))) {
        // 単一リポジトリ
        console.log(`Target: ${target}`);
        const hits = scanRepo(target, config.keywords);
        printHits(basename(target), hits);
        console.log(`\nTotal: ${hits.length} hit(s)`);
      } else {
        // ディレクトリ内の全リポジトリ
        const repos = listRepos();
        console.log(`Target: ${repos.length} repositories in ${target}`);
        log(`Repos: ${repos.map((r) => r.name).join(", ")}`);
        let total = 0;
        let clean = 0;
        for (const repo of repos) {
          const hits = scanRepo(repo.path, config.keywords);
          if (hits.length) {
            printHits(repo.name, hits);
            total += hits.length;
          } else {
            clean++;
          }
        }
        console.log(`\nTotal: ${total} hit(s) across ${repos.length} repositories (${clean} clean)`);
      }
      break;
    }

    default:
      console.log(
        "Usage: env-leak-checker.mjs <scan|list|add|remove|serve> [args]"
      );
  }
}

function printHits(repoName, hits) {
  if (!hits.length) return;
  console.log(`\n=== ${repoName} (${hits.length} hits) ===`);
  for (const h of hits) {
    const kws = h.keywords.map((k) => `[${k}]`).join(" ");
    console.log(`  ${h.file}:${h.line}  ${kws}`);
    console.log(`    ${h.content}`);
  }
}

// ── GUI サーバー ──────────────────────────────────────────

function startServer(port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // API routes
    if (url.pathname === "/api/keywords" && req.method === "GET") {
      const config = loadKeywords();
      json(res, 200, config);
      return;
    }

    if (url.pathname === "/api/keywords" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadKeywords();
      if (body.keyword && !config.keywords.includes(body.keyword)) {
        config.keywords.push(body.keyword);
        saveKeywords(config);
      }
      json(res, 200, config);
      return;
    }

    if (url.pathname === "/api/keywords" && req.method === "DELETE") {
      const body = await readBody(req);
      const config = loadKeywords();
      config.keywords = config.keywords.filter((k) => k !== body.keyword);
      saveKeywords(config);
      json(res, 200, config);
      return;
    }

    if (url.pathname === "/api/repos" && req.method === "GET") {
      const repos = listRepos();
      json(res, 200, { repos: repos.map((r) => r.name) });
      return;
    }

    if (url.pathname === "/api/scan" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadKeywords();
      if (!config.keywords.length) {
        json(res, 200, { results: [], message: "No keywords registered" });
        return;
      }

      const allResults = [];
      const scanLog = [];
      const targetRepos = body.repo
        ? [{ name: body.repo, path: join(BASE_DIR, body.repo) }]
        : listRepos();

      const t0 = performance.now();
      for (const repo of targetRepos) {
        if (!existsSync(join(repo.path, ".git"))) continue;
        const rt0 = performance.now();
        const hits = scanRepo(repo.path, config.keywords);
        const elapsed = (performance.now() - rt0).toFixed(0);
        scanLog.push({ repo: repo.name, hits: hits.length, ms: parseInt(elapsed, 10) });
        if (hits.length) {
          allResults.push({ repo: repo.name, hits });
        }
      }
      const totalMs = (performance.now() - t0).toFixed(0);

      json(res, 200, { results: allResults, scanLog, totalMs: parseInt(totalMs, 10), scannedRepos: targetRepos.length });
      return;
    }

    // Serve GUI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(`env-leak-checker GUI: http://localhost:${port}`);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
  });
}

// ── HTML (インライン SPA) ─────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>env-leak-checker</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin-bottom: 16px; color: #58a6ff; }
  h2 { font-size: 1.1rem; margin: 20px 0 8px; color: #8b949e; }
  .section { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  .row { display: flex; gap: 8px; margin-bottom: 8px; }
  input[type="text"], select { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 10px; border-radius: 4px; font-size: 14px; flex: 1; }
  button { background: #238636; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap; }
  button:hover { background: #2ea043; }
  button.danger { background: #da3633; }
  button.danger:hover { background: #f85149; }
  button.scan { background: #1f6feb; }
  button.scan:hover { background: #388bfd; }
  .tag { display: inline-flex; align-items: center; gap: 4px; background: #30363d; padding: 3px 8px; border-radius: 12px; font-size: 13px; margin: 2px; }
  .tag .x { cursor: pointer; color: #f85149; font-weight: bold; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; min-height: 28px; }
  .result-repo { margin-top: 12px; }
  .result-repo summary { cursor: pointer; font-weight: 600; color: #f0883e; }
  .hit { font-size: 13px; font-family: monospace; padding: 4px 0; border-bottom: 1px solid #21262d; }
  .hit .file { color: #58a6ff; }
  .hit .line { color: #8b949e; }
  .hit .kw { color: #f85149; font-weight: bold; }
  .hit .content { color: #8b949e; display: block; margin-left: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 700px; }
  .status { padding: 8px; font-size: 14px; color: #8b949e; }
  .clean { color: #3fb950; font-weight: bold; }
  .found { color: #f85149; font-weight: bold; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #30363d; border-top-color: #58a6ff; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<h1>env-leak-checker</h1>

<div class="section">
  <h2>Keywords</h2>
  <div class="row">
    <input type="text" id="kwInput" placeholder="環境名・個人名を入力...">
    <button onclick="addKeyword()">追加</button>
  </div>
  <div class="tags" id="kwTags"></div>
</div>

<div class="section">
  <h2>Scan</h2>
  <div class="row">
    <select id="repoSelect"><option value="">全リポジトリ</option></select>
    <button class="scan" onclick="runScan()">スキャン実行</button>
  </div>
  <div id="scanStatus" class="status"></div>
  <div id="scanResults"></div>
</div>

<script>
const API = '';

async function fetchKeywords() {
  const res = await fetch(API + '/api/keywords');
  const data = await res.json();
  renderTags(data.keywords);
}

async function fetchRepos() {
  const res = await fetch(API + '/api/repos');
  const data = await res.json();
  const sel = document.getElementById('repoSelect');
  for (const r of data.repos) {
    const opt = document.createElement('option');
    opt.value = r; opt.textContent = r;
    sel.appendChild(opt);
  }
}

function renderTags(keywords) {
  const el = document.getElementById('kwTags');
  el.innerHTML = keywords.map(k =>
    '<span class="tag">' + esc(k) + ' <span class="x" onclick="removeKeyword(\\''+esc(k)+'\\')">x</span></span>'
  ).join('');
}

async function addKeyword() {
  const input = document.getElementById('kwInput');
  const kw = input.value.trim();
  if (!kw) return;
  const res = await fetch(API + '/api/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: kw }),
  });
  const data = await res.json();
  renderTags(data.keywords);
  input.value = '';
  input.focus();
}

async function removeKeyword(kw) {
  const res = await fetch(API + '/api/keywords', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: kw }),
  });
  const data = await res.json();
  renderTags(data.keywords);
}

async function runScan() {
  const repo = document.getElementById('repoSelect').value;
  const statusEl = document.getElementById('scanStatus');
  const resultsEl = document.getElementById('scanResults');
  statusEl.innerHTML = '<span class="spinner"></span> スキャン中...';
  resultsEl.innerHTML = '';

  const res = await fetch(API + '/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: repo || undefined }),
  });
  const data = await res.json();

  if (data.message) {
    statusEl.innerHTML = data.message;
    return;
  }

  // Scan log
  if (data.scanLog) {
    const logHtml = '<div style="margin:8px 0;font-size:12px;font-family:monospace;color:#8b949e;max-height:120px;overflow:auto;background:#0d1117;padding:6px;border-radius:4px">' +
      '<div style="color:#58a6ff;margin-bottom:4px">Scanned ' + data.scannedRepos + ' repos in ' + data.totalMs + 'ms</div>' +
      data.scanLog.map(l =>
        '<div>' + (l.hits > 0 ? '<span style="color:#f85149">' : '<span style="color:#3fb950">') +
        l.repo + '</span> — ' + l.hits + ' hits (' + l.ms + 'ms)</div>'
      ).join('') + '</div>';
    resultsEl.innerHTML = logHtml;
  }

  const totalHits = data.results.reduce((s, r) => s + r.hits.length, 0);
  if (totalHits === 0) {
    statusEl.innerHTML = '<span class="clean">CLEAN</span> — 漏洩なし';
    return;
  }

  statusEl.innerHTML = '<span class="found">' + totalHits + ' 件検出</span>';

  resultsEl.innerHTML += data.results.map(r => {
    const hitsHtml = r.hits.map(h =>
      '<div class="hit">' +
        '<span class="file">' + esc(h.file) + '</span>' +
        ':<span class="line">' + h.line + '</span> ' +
        h.keywords.map(k => '<span class="kw">[' + esc(k) + ']</span>').join(' ') +
        '<span class="content">' + esc(h.content) + '</span>' +
      '</div>'
    ).join('');
    return '<details class="result-repo" open>' +
      '<summary>' + esc(r.repo) + ' (' + r.hits.length + ')</summary>' +
      hitsHtml + '</details>';
  }).join('');
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

document.getElementById('kwInput').addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });

fetchKeywords();
fetchRepos();
</script>
</body>
</html>`;

// ── エントリポイント ──────────────────────────────────────

const rawArgs = process.argv.slice(2);
if (rawArgs.includes("-v") || rawArgs.includes("--verbose")) {
  VERBOSE = true;
}
const args = rawArgs.filter((a) => a !== "-v" && a !== "--verbose");

if (args[0] === "serve") {
  const portIdx = args.indexOf("--port");
  const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 7700;
  startServer(port);
} else if (args.length === 0) {
  console.log(
    "Usage: env-leak-checker.mjs <scan|list|add|remove|serve> [args]\n" +
    "  -v, --verbose    Show scan targets and timing"
  );
} else {
  runCli(args);
}
