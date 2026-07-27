#!/usr/bin/env node
/**
 * utf8bom — ソースコードを UTF-8 BOM 付きに一括変換
 *
 * Usage:
 *   node utf8bom.mjs <directory> [--dry-run] [--ext .cpp,.h,.c,.hpp,.ts,.js]
 *
 * Options:
 *   --dry-run    変換せず対象ファイルの一覧のみ表示
 *   --ext        対象拡張子をカンマ区切りで指定 (デフォルト: .c,.cpp,.h,.hpp,.cc,.cxx,.hxx,.cs,.ts,.tsx,.js,.jsx,.rs,.py,.java)
 *   --force      既に BOM 付きのファイルもスキップせず再書き込み
 *
 * Examples:
 *   node utf8bom.mjs /path/to/project
 *   node utf8bom.mjs ./src --ext .cpp,.h,.hpp --dry-run
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

const DEFAULT_EXTENSIONS = new Set([
  ".c", ".cpp", ".h", ".hpp", ".cc", ".cxx", ".hxx",
  ".cs",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts",
  ".rs",
  ".py",
  ".java",
  // Note: .glsl/.vert/.frag/.comp are excluded — SPIR-V compilers reject BOM
]);

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { dir: null, dryRun: false, force: false, extensions: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      opts.dryRun = true;
    } else if (args[i] === "--force") {
      opts.force = true;
    } else if (args[i] === "--ext" && i + 1 < args.length) {
      i++;
      opts.extensions = new Set(
        args[i].split(",").map((e) => (e.startsWith(".") ? e : `.${e}`))
      );
    } else if (!args[i].startsWith("--")) {
      opts.dir = args[i];
    }
  }

  if (!opts.dir) {
    console.error("Usage: node utf8bom.mjs <directory> [--dry-run] [--ext .cpp,.h]");
    process.exit(1);
  }

  if (!opts.extensions) {
    opts.extensions = DEFAULT_EXTENSIONS;
  }

  return opts;
}

async function* walkDir(dir, extensions) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Skip hidden dirs, node_modules, build dirs, .git
    if (entry.isDirectory()) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "build" ||
        entry.name === "dist" ||
        entry.name === "out" ||
        entry.name === "target" ||
        entry.name === "__pycache__"
      ) {
        continue;
      }
      yield* walkDir(fullPath, extensions);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
        yield fullPath;
      }
    }
  }
}

function hasBom(buf) {
  return buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function writeFileWithRetry(filePath, data, retries = 3, delayMs = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      await writeFile(filePath, data);
      return;
    } catch (err) {
      if (i < retries && err.code === "EBUSY") {
        console.log(`  [retry ${i + 1}/${retries}] ${filePath} (locked, waiting ${delayMs}ms...)`);
        await sleep(delayMs);
        delayMs *= 2;
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const dir = resolve(opts.dir);

  // Verify directory exists
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch {
    console.error(`Error: ${dir} does not exist`);
    process.exit(1);
  }

  console.log(`utf8bom: scanning ${dir}`);
  console.log(`  Extensions: ${[...opts.extensions].join(", ")}`);
  if (opts.dryRun) console.log("  Mode: dry-run (no changes)");
  console.log("");

  let scanned = 0;
  let converted = 0;
  let skipped = 0;
  let errors = 0;
  const failedFiles = [];

  for await (const filePath of walkDir(dir, opts.extensions)) {
    scanned++;
    try {
      const buf = await readFile(filePath);

      if (hasBom(buf) && !opts.force) {
        skipped++;
        continue;
      }

      if (opts.dryRun) {
        const status = hasBom(buf) ? "(already BOM, --force)" : "(needs BOM)";
        console.log(`  [convert] ${filePath} ${status}`);
        converted++;
        continue;
      }

      // Strip existing BOM if present, then prepend BOM
      const content = hasBom(buf) ? buf.subarray(3) : buf;
      const output = Buffer.concat([BOM, content]);
      await writeFileWithRetry(filePath, output);
      converted++;

      const rel = filePath.slice(dir.length + 1);
      console.log(`  ✓ ${rel}`);
    } catch (err) {
      errors++;
      failedFiles.push(filePath);
      console.error(`  ✗ ${filePath}: ${err.message}`);
    }
  }

  console.log("");
  console.log("--- Summary ---");
  console.log(`  Scanned:   ${scanned}`);
  console.log(`  Converted: ${converted}`);
  console.log(`  Skipped:   ${skipped} (already BOM)`);
  if (errors > 0) {
    console.log(`  Errors:    ${errors}`);
    for (const f of failedFiles) console.log(`    - ${f}`);
  }
}

main();
