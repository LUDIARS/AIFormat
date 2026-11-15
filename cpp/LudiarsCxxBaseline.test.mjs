// node --test cpp/LudiarsCxxBaseline.test.mjs
// baseline を include した小さな CMake プロジェクトを configure し、compile_commands.json で
// 警告・エラー化・hardening のフラグが意図した TU にだけ付くことを確かめる。cmake と
// コンパイラ (g++ / clang++) が無い環境では skip する。各リポへは同期しない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "LudiarsCxxBaseline.cmake");

function which(tool) {
  return spawnSync(tool, ["--version"], { stdio: "ignore" }).status === 0;
}

const COMPILERS = [["gcc", "g++"], ["clang", "clang++"]].filter(([c, cxx]) => which(c) && which(cxx));
const SKIP = !which("cmake") || COMPILERS.length === 0;

/**
 * demo_core (準拠 target) / demo_legacy (準拠前) / host_app (demo_core を使うホスト。warnings はリンクしない) /
 * vendor (third_party。baseline の target を何もリンクしない) の 4 つを持つプロジェクト。
 */
function writeProject(dir, extra = "") {
  mkdirSync(path.join(dir, "third_party"), { recursive: true });
  for (const name of ["core", "legacy", "app", "third_party/vendor"]) {
    writeFileSync(path.join(dir, `${name}.cpp`), "int f() { return 0; }\n");
  }
  writeFileSync(path.join(dir, "third_party/CMakeLists.txt"), "add_library(vendor STATIC vendor.cpp)\n");
  writeFileSync(path.join(dir, "CMakeLists.txt"), [
    "cmake_minimum_required(VERSION 3.24)",
    "project(demo LANGUAGES C CXX)",
    `include("${BASELINE.replace(/\\/g, "/")}")`,
    "add_subdirectory(third_party)",
    "add_library(demo_core STATIC core.cpp)",
    "target_link_libraries(demo_core PUBLIC ludiars_cxx_usage PRIVATE ludiars_cxx_warnings)",
    "ludiars_cxx_mark_warnings_compliant(demo_core)",
    "add_library(demo_legacy STATIC legacy.cpp)",
    "target_link_libraries(demo_legacy PUBLIC ludiars_cxx_usage PRIVATE ludiars_cxx_warnings)",
    "add_executable(host_app app.cpp)",
    "target_link_libraries(host_app PRIVATE demo_core)",
    extra,
    "",
  ].join("\n"));
}

/** configure して、ファイル名 (拡張子なし) → コンパイル引数 1 行 の表を返す。失敗なら { error }。 */
function configure([cc, cxx], options, extra) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ludiars-baseline-"));
  try {
    writeProject(dir, extra);
    const result = spawnSync("cmake", [
      "-S", dir, "-B", path.join(dir, "build"), "-G", which("ninja") ? "Ninja" : "Unix Makefiles",
      `-DCMAKE_C_COMPILER=${cc}`, `-DCMAKE_CXX_COMPILER=${cxx}`, "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
      ...Object.entries(options).map(([k, v]) => `-D${k}=${v}`),
    ], { encoding: "utf8" });
    if (result.status !== 0) return { error: `${result.stdout}\n${result.stderr}` };
    const commands = JSON.parse(readFileSync(path.join(dir, "build/compile_commands.json"), "utf8"));
    const byName = {};
    for (const c of commands) byName[path.basename(c.file, ".cpp")] = ` ${c.command ?? c.arguments.join(" ")} `;
    return { byName };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const has = (command, flag) => command.includes(` ${flag} `);

for (const compilers of COMPILERS) {
  const label = compilers[1];

  test(`${label}: 警告は Praesidium の警告パスを含み、非推奨のエラー化は準拠 target だけ (§C4.3)`, { skip: SKIP }, () => {
    const { byName, error } = configure(compilers, { LUDIARS_CXX_WARNINGS_AS_ERRORS: "ON" });
    assert.ok(byName, error);
    for (const flag of ["-Wall", "-Wextra", "-Wformat=2", "-Wvla", "-Wnull-dereference"]) {
      assert.ok(has(byName.core, flag) && has(byName.legacy, flag), `${flag} が warnings をリンクした target に付く`);
      assert.ok(!has(byName.app, flag) && !has(byName.vendor, flag), `${flag} は warnings をリンクしない target に漏れない`);
    }
    assert.ok(has(byName.core, "-Werror") && has(byName.core, "-Werror=deprecated-declarations"), "準拠 target は全警告と非推奨をエラー化");
    assert.ok(has(byName.legacy, "-Werror=return-type"), "準拠前の target にも段 1 のエラー化は付く");
    assert.ok(!has(byName.legacy, "-Werror") && !has(byName.legacy, "-Werror=deprecated-declarations"), "準拠前の target は非推奨をエラーにしない");
  });

  test(`${label}: LUDIARS_CXX_HARDENING はビルド全体に同じ値で付く (§C2.9 / §C4.10)`, { skip: SKIP }, () => {
    const on = configure(compilers, { LUDIARS_CXX_HARDENING: "ON" });
    assert.ok(on.byName, on.error);
    for (const name of ["core", "legacy", "app", "vendor"]) {
      assert.ok(has(on.byName[name], "-D_GLIBCXX_ASSERTIONS"), `${name}: _GLIBCXX_ASSERTIONS`);
      assert.ok(has(on.byName[name], "-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_EXTENSIVE"), `${name}: _LIBCPP_HARDENING_MODE`);
      assert.ok(has(on.byName[name], "-ftrivial-auto-var-init=pattern"), `${name}: -ftrivial-auto-var-init=pattern`);
    }
    const off = configure(compilers, { LUDIARS_CXX_HARDENING: "OFF" });
    assert.ok(off.byName, off.error);
    for (const name of ["core", "legacy", "app", "vendor"]) assert.ok(!off.byName[name].includes("_GLIBCXX_ASSERTIONS"), name);
  });

  test(`${label}: target ごとの ludiars_cxx_enable_hardening は廃止 (configure で止まる)`, { skip: SKIP }, () => {
    const result = configure(compilers, {}, "ludiars_cxx_enable_hardening(demo_core)");
    assert.ok(result.error && /ludiars_cxx_enable_hardening は 2\.0\.0\s+で廃止/.test(result.error), result.error ?? "configure が通った");
  });
}
