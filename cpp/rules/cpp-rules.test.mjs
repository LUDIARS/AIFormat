// node --test cpp/rules/cpp-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  rules,
  maskCommentsAndLiterals,
  scanSource,
  scanChangeset,
  parseRepoConfig,
  parseUnifiedDiff,
  main,
} from "./cpp-rules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 規則名 → 行番号の一覧。 */
function linesOf(name, file, source, options = {}) {
  const config = options.config ? parseRepoConfig(options.config) : undefined;
  return scanSource(file, source, { addedLines: options.addedLines ?? null, ...(config ? { config } : {}) })
    .filter((f) => f.rule === name)
    .map((f) => f.line);
}

function changesetLinesOf(name, changes, options = {}) {
  const config = options.config ? parseRepoConfig(options.config) : undefined;
  return scanChangeset(changes, { repoFiles: options.repoFiles ?? [], ...(config ? { config } : {}) })
    .filter((f) => f.rule === name)
    .map((f) => `${f.file}:${f.line}`);
}

// ---------------------------------------------------------------------------
// 規則ごとの肯定例 (検出する) / 否定例 (検出しない)
//   pos: [file, source, expectedLines, options?]
//   neg: [file, source, options?]  — コメント内・文字列内・除外パス・許可形
// ---------------------------------------------------------------------------

const PUB = "include/ergo/net/datagram.h";
const SRC = "src/render/stage_renderer.cpp";
const CML = "CMakeLists.txt";
const LOGIC = { logicDirs: ["src/world/"] };

const CASES = {
  "unconstrained-callable-template": {
    pos: [
      ["include/ergo/physics2d/world.h", "template <typename Fn>\nvoid for_each_body(Fn&& fn) { fn(1); }\n", [1]],
      ["include/ergo/math/pool.h", "template <typename T, typename... Args>\nT* create(Args&&... args);\n", [1]],
      ["include/ergo/math/pool.h", "x;\ntemplate <class Visitor>\nvoid visit(\n  Visitor v);\n", [2], { addedLines: [4] }],
    ],
    neg: [
      [PUB, "template <std::invocable<int> Fn>\nvoid f(Fn&& fn);\n"],
      [PUB, "template <typename Fn>\n  requires std::invocable<Fn>\nvoid f(Fn&& fn);\n"],
      [PUB, "template <typename F>\nvoid f(F f) requires std::invocable<F> {}\n"],
      [PUB, "template <typename Fn>\nconcept Callable = std::invocable<Fn>;\n"],
      [PUB, "template <template <typename> class F>\nstruct Wrap {};\n"],
      [PUB, "template <typename Fn>\nclass Holder { Fn fn_; };\n"],
      [PUB, "template <typename... Ts>\nvoid g(Ts... ts);\n"],
      [PUB, "// template <typename Fn> void f(Fn fn);\nconst char* s = \"template <typename Fn> void f(Fn);\";\n"],
      [PUB, "template <typename Fn>\nvoid f(Fn&& fn);\n", { addedLines: [9] }],
      ["third_party/foo/foo.h", "template <typename Fn>\nvoid f(Fn&& fn);\n"],
    ],
  },
  sfinae: {
    pos: [[PUB, "template <typename T, typename = std::enable_if_t<std::is_integral_v<T>>>\nvoid f(T);\n", [1]],
      [PUB, "template <typename T, typename = std::void_t<decltype(T::x)>>\nstruct H {};\n", [1]]],
    neg: [
      [PUB, "// std::enable_if は使わない\nconst char* s = \"enable_if\";\n"],
      [PUB, "template <typename T, typename = std::enable_if_t<true>> // NOLINT(cpp-rules-C1.2): 旧 API 互換 (§C1.2)\nvoid f(T);\n"],
    ],
  },
  "concept-outside-concepts-h": {
    pos: [["include/ergo/math/vec.h", "template <typename T>\nconcept Scalar = std::is_arithmetic_v<T>;\n", [2]]],
    neg: [
      ["include/ergo/math/concepts.h", "template <typename T>\nconcept Scalar = std::is_arithmetic_v<T>;\n"],
      ["tests/math/test_math_concepts.cpp", "template <typename T>\nconcept Local = true;\n"],
      ["include/ergo/math/vec.h", "// concept Scalar = ...\n"],
    ],
  },
  "interface-data-member": {
    pos: [
      ["include/ergo/gpu_particle/gpu_backend.h", "class IGpuBackend {\npublic:\n    virtual ~IGpuBackend() = default;\n    int count_ = 0;\n    std::function<void(int)> cb_;\n};\n", [4, 5]],
    ],
    neg: [
      ["include/ergo/gpu_particle/gpu_backend.h", [
        "class IGpuBackend {",
        "public:",
        "    virtual ~IGpuBackend() = default;",
        "    virtual void draw(int n) = 0;",
        "    static constexpr int kMax = 4;",
        "    using Ptr = std::unique_ptr<IGpuBackend>;",
        "    IGpuBackend(const IGpuBackend&) = delete;",
        "    IGpuBackend& operator=(const IGpuBackend&) = delete;",
        "    [[nodiscard]] virtual bool ok() const noexcept { return true; }",
        "};",
      ].join("\n")],
      [PUB, "class Image { int w_; };\nstruct Info { int a; };\n"],
      [PUB, "enum class IKind : int { A, B };\n"],
    ],
  },
  "ptr-size-param": {
    pos: [[PUB, "bool parse(const uint8_t* data, size_t size);\nvoid send(int id,\n          const void* bytes, std::size_t n);\n", [1, 3]]],
    neg: [
      ["src/world/proto/datagram.h", "bool parse(const uint8_t* data, size_t size);\n"],
      [PUB, "bool parse(std::span<const std::byte> data);\n// bool parse(const uint8_t* data, size_t size);\n"],
    ],
  },
  "vector-param": {
    pos: [[PUB, "void set(const std::vector<int>& values);\n", [1]]],
    neg: [
      [PUB, "const std::vector<int>& values() const;\n"],
      ["src/net/x.h", "void set(const std::vector<int>& values);\n"],
    ],
  },
  "modules-coroutines": {
    pos: [
      ["src/math/vec.cpp", "export module ergo.math;\n", [1]],
      ["src/math/vec.cpp", "import std;\nimport <vector>;\nimport \"local.h\";\n", [1, 2, 3]],
      ["src/net/task.cpp", "Task run() {\n  co_await next();\n}\n", [2]],
    ],
    neg: [
      ["src/net/task.cpp", "// co_await は使わない\nconst char* s = \"import std;\";\nint module_count = 0;\nimport_scene(x);\nmodule = load();\n"],
    ],
  },
  "module-unit-file": {
    pos: [["src/math/vec.cppm", "int x;\n", [1]]],
    neg: [["src/math/vec.cpp", "int x;\n"]],
  },
  "cmake-modules": {
    pos: [[CML, "set(CMAKE_CXX_SCAN_FOR_MODULES ON)\ntarget_sources(x PUBLIC FILE_SET m TYPE CXX_MODULES FILES a.cppm)\n", [1, 2]]],
    neg: [[CML, "set(CMAKE_CXX_SCAN_FOR_MODULES OFF)\n# CXX_SCAN_FOR_MODULES ON\n"]],
  },
  "load-library": {
    pos: [
      ["src/input/mediapipe_loader.cpp", "HMODULE h = LoadLibraryW(path.c_str());\n", [1]],
      ["src/input/x.cpp", "auto h = LoadLibrary(p); // NOLINT(cpp-rules-C1.8): 互換 (§C1.8)\n", [1]],
    ],
    neg: [
      ["src/input/mediapipe_loader.cpp", "HMODULE h = LoadLibraryExW(p, nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR);\n// LoadLibraryW(p)\n"],
    ],
  },
  "loader-outside": {
    pos: [["src/input/mediapipe_hand_source.cpp", "void* h = dlopen(p, RTLD_NOW | RTLD_LOCAL);\n", [1]]],
    neg: [
      ["src/input/mediapipe_loader.cpp", "void* h = dlopen(p, RTLD_NOW | RTLD_LOCAL);\n"],
      ["src/input/x.cpp", "const char* s = \"dlopen(\";\n"],
    ],
  },
  "banned-api": {
    pos: [
      [SRC, "int n = atoi(s);\nstd::sscanf(buf, \"%d\", &x);\nstrcpy(a, b);\nint r = rand();\n", [1, 2, 3, 4]],
      [SRC, "int n = atoi(s); // NOLINT(cpp-rules-C2.1): 既存 (§C2.1)\n", [1]],
    ],
    neg: [
      [SRC, "int a = rng.rand();\nint b = my::atoi(x);\nint c = ptr->rand();\nconst char* s = \"atoi(\";\n// strcpy(a, b);\nint n = snprintf(buf, sizeof(buf), \"%d\", v);\noperand(x);\n"],
    ],
  },
  "std-sto": {
    pos: [[SRC, "auto n = std::stoul(header);\nauto d = stod(text);\n", [1, 2]]],
    neg: [[SRC, "auto r = std::from_chars(b, e, v);\nstore(x);\nobj.stoi(x);\n// std::stoi(x)\n"]],
  },
  "gpu-struct-layout": {
    pos: [
      ["src/gpu_particle/particle_system.cpp", [
        "struct EmitterUBO { float rate; float life; };",
        "void push(VkCommandBuffer cmd, VkPipelineLayout l) {",
        "  EmitterUBO ubo{};",
        "  vkCmdPushConstants(cmd, l, VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(EmitterUBO), &ubo);",
        "  memcpy(mapped, &ubo, sizeof(ubo));",
        "}",
      ].join("\n"), [4, 5]],
    ],
    neg: [
      ["src/gpu_particle/particle_system.cpp", [
        "struct EmitterUBO { float rate; float life; };",
        "static_assert(sizeof(EmitterUBO) == 8);",
        "static_assert(offsetof(EmitterUBO, life) == 4);",
        "void push(VkCommandBuffer cmd, VkPipelineLayout l, const EmitterUBO& ubo) {",
        "  vkCmdPushConstants(cmd, l, VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(EmitterUBO), &ubo);",
        "}",
      ].join("\n")],
      ["src/gpu_particle/particle_system.cpp", "void push(VkCommandBuffer cmd) {\n  vkCmdPushConstants(cmd, l, s, 0, sizeof(ParticleState), &st);\n}\n"],
    ],
  },
  "reinterpret-cast": {
    pos: [
      [SRC, "auto* h = reinterpret_cast<const Header*>(buf);\n", [1]],
      [SRC, "auto* h = reinterpret_cast<const Header*>(buf); // NOLINT(cppcoreguidelines-pro-type-reinterpret-cast): 理由\n", [1]],
    ],
    neg: [
      [SRC, "auto* a = reinterpret_cast<sockaddr*>(&in); // NOLINT(cppcoreguidelines-pro-type-reinterpret-cast): sockaddr の C API 境界 (§C2.5)\n"],
      [SRC, "// NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast): バイト列への変換 (§C2.5)\nauto* b = reinterpret_cast<const std::byte*>(p);\n"],
      [SRC, "// reinterpret_cast<int*>(p) は禁止\n"],
    ],
  },
  "c-style-cast": {
    pos: [[SRC, "int n = (int)size;\nreturn (Foo*)p;\nf((uint16_t)x);\nauto c = (unsigned char)*p;\n", [1, 2, 3, 4]]],
    neg: [[SRC, [
      "(void)unused;",
      "auto s = sizeof(int) * n;",
      "void f(int) noexcept;",
      "std::function<void(int)> cb;",
      "auto l = [](int) { return 0; };",
      "if (a) (void)b;",
      "int m = static_cast<int>(x);",
      "try {} catch (int) {}",
      "void g(Foo*) const;",
      "// (int)x",
    ].join("\n")]],
  },
  "functional-cast": {
    pos: [[SRC, "float r = float(a) / b;\nreturn int(x);\ncall(uint32_t(v));\n", [1, 2, 3]]],
    neg: [[SRC, [
      "std::function<int(int)> f;",
      "void g(int (*cb)(int));",
      "auto* p = new int(5);",
      "explicit operator bool() const;",
      "int x(5);",
      "int z = int();",
      "// int(x)",
    ].join("\n")]],
  },
  "size-narrowing": {
    pos: [[SRC, "out.count = static_cast<uint16_t>(rows.size());\nauto n = static_cast<int>(name.length());\n", [1, 2]]],
    neg: [[SRC, "auto a = static_cast<size_t>(rows.size());\nauto b = narrow<uint16_t>(rows.size());\n"]],
  },
  "utf8-path": {
    pos: [[SRC, "auto p = std::filesystem::path(name);\nauto q = fs::u8path(s);\nint n = MultiByteToWideChar(CP_UTF8, 0, s, -1, nullptr, 0);\n", [1, 2, 3]]],
    neg: [
      ["src/io/utf8_path.cpp", "auto p = std::filesystem::path(name);\n"],
      ["src/io/path_conv.cpp", "auto p = fs::path(name);\n", { config: { ioHelpers: ["src/io/path_conv.cpp"] } }],
      [SRC, "auto p = std::filesystem::path(u8\"x\");\n// fs::u8path(s)\n"],
    ],
  },
  "test-framework-include": {
    pos: [["tests/math/test_vec.cpp", "#include <catch2/catch_test_macros.hpp>\n#include \"doctest/doctest.h\"\n", [1, 2]]],
    neg: [["tests/math/test_vec.cpp", "#include <gtest/gtest.h>\n// #include <catch2/catch_test_macros.hpp>\nconst char* s = \"#include <gmock/gmock.h>\";\n"]],
  },
  "test-framework-cmake": {
    pos: [[CML, "FetchContent_Declare(googletest URL https://example.invalid/gt.zip)\nfind_package(GTest REQUIRED)\n", [1, 2]]],
    neg: [
      [CML, "# FetchContent_Declare(googletest)\nFetchContent_Declare(fmt GIT_TAG 10.2.1)\n"],
      [CML, "find_package(GTest REQUIRED)\n", { config: { disable: { "C3.1": "Pictor は Ergo の下位なので本家 gtest を使う" } } }],
    ],
  },
  "tests-main": {
    pos: [["tests/packages/test_git_remote_source.cpp", "int main(int argc, char** argv) {\n  return 0;\n}\n", [1]]],
    neg: [
      ["tests/consumer/main.cpp", "int main() { return 0; }\n"],
      ["src/app/main.cpp", "int main() { return 0; }\n"],
      ["tests/math/test_vec.cpp", "// int main() は書かない\n"],
    ],
  },
  "augur-cpp": {
    pos: [["augur.contracts.json", "{\n  \"files\": [\"src/io/file.cpp\"]\n}\n", [2]]],
    neg: [["augur.contracts.json", "{\n  \"files\": [\"src/io/file.ts\"]\n}\n"]],
  },
  "cxx-standard": {
    pos: [[CML, "set(CMAKE_CXX_STANDARD 17)\nset_target_properties(x PROPERTIES CXX_STANDARD 20)\ntarget_compile_features(x PUBLIC cxx_std_20)\nset(CMAKE_CXX_EXTENSIONS ON)\n", [1, 2, 3, 4]]],
    neg: [
      ["cmake/LudiarsCxxBaseline.cmake", "target_compile_features(ludiars_cxx_usage INTERFACE cxx_std_20)\n"],
      [CML, "# set(CMAKE_CXX_STANDARD 17)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nset(CMAKE_CXX_EXTENSIONS OFF)\n"],
    ],
  },
  "per-target-utf8": {
    pos: [[CML, "target_compile_options(ergo_bind PRIVATE\n  $<$<CXX_COMPILER_ID:MSVC>:/utf-8>)\nadd_compile_options(\"/utf-8\")\n", [2, 3]]],
    neg: [
      ["cmake/LudiarsCxxBaseline.cmake", "target_compile_options(ludiars_cxx_usage INTERFACE /utf-8)\n"],
      [CML, "# target_compile_options(x PRIVATE /utf-8)\ntarget_compile_options(x PRIVATE /W4)\n"],
    ],
  },
  "source-nominmax": {
    pos: [[SRC, "#define NOMINMAX\n#  define WIN32_LEAN_AND_MEAN\n#include <windows.h>\n", [1, 2]]],
    neg: [[SRC, "// #define NOMINMAX\n#undef NOMINMAX\n#ifdef NOMINMAX\n#endif\n"]],
  },
  "public-math-defines": {
    pos: [[CML, "target_compile_definitions(ergo_math\n  PUBLIC _USE_MATH_DEFINES)\n", [2]]],
    neg: [[CML, "target_compile_definitions(ergo_math PRIVATE _USE_MATH_DEFINES)\n# target_compile_definitions(x PUBLIC _USE_MATH_DEFINES)\n"]],
  },
  "file-glob": {
    pos: [
      [CML, "file(GLOB_RECURSE SRC src/*.cpp)\n", [1]],
      // tests/ の CMakeLists.txt と、ビルドに読まれる cmake/ のモジュールは見る
      ["tests/CMakeLists.txt", "file(GLOB TEST_SRC *.cpp)\n", [1]],
      ["cmake/ergo_sources.cmake", "file(GLOB SRC ${CMAKE_CURRENT_LIST_DIR}/../src/*.cpp)\n", [1]],
    ],
    neg: [
      ["cmake/LudiarsCxxBaseline.cmake", "file(GLOB X *.cmake)\n"],
      [CML, "# file(GLOB SRC src/*.cpp)\ntarget_sources(x PRIVATE src/a.cpp)\n"],
      // `cmake -P` で実行するテストスクリプトは成果物を GLOB して中身を検査するだけ (Ergo の実測で出た誤検出)
      ["tests/packages/test_unity_package.cmake", "file(GLOB asmdefs \"${PKG}/*.asmdef\")\nfile(GLOB_RECURSE fixtures \"${PKG}/fixtures/*.json\")\n"],
      ["native/test/scripts/check_bundle.cmake", "file(GLOB files \"${OUT}/*\")\n"],
    ],
  },
  "directory-scope": {
    pos: [[CML, "include_directories(include)\nadd_compile_options(/W4)\n", [1, 2]]],
    neg: [[CML, "target_include_directories(x PUBLIC include)\n# include_directories(include)\n"]],
  },
  "cache-force": {
    pos: [
      [CML, "option(SUIKA_ENABLE_CERNERE \"Cernere\" ON)\nif(NOT X)\n  set(SUIKA_ENABLE_CERNERE OFF CACHE BOOL \"\" FORCE)\nendif()\n", [3]],
      [CML, "set(ERGO_WITH_VULKAN OFF CACHE BOOL \"\" FORCE)\n", [1], { config: { prefix: "ERGO" } }],
    ],
    neg: [
      ["cmake/deps/curl.cmake", "set(BUILD_CURL_EXE OFF CACHE BOOL \"\" FORCE)\n"],
      [CML, "option(ERGO_WITH_VULKAN \"Vulkan\" ON)\nset(ERGO_WITH_VULKAN OFF CACHE BOOL \"doc\")\n# set(ERGO_WITH_VULKAN OFF CACHE BOOL \"\" FORCE)\n"],
    ],
  },
  "foreign-src": {
    pos: [[CML, "target_include_directories(x PRIVATE ${ERGO_DIR}/src)\ntarget_include_directories(y PRIVATE ../Ergo/src)\n", [1, 2]]],
    neg: [
      [CML, "target_include_directories(x PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src ${PROJECT_SOURCE_DIR}/src)\n# ../Ergo/src\n"],
      [CML, "target_include_directories(x PRIVATE ${ERGO_SOURCE_DIR}/src)\n", { config: { prefix: "ERGO" } }],
    ],
  },
  "os-in-public-header": {
    pos: [[PUB, "#ifdef _WIN32\n#include <windows.h>\n#endif\n#if defined(__ANDROID__)\n#endif\n", [1, 2, 4]]],
    neg: [
      ["src/net/socket.cpp", "#ifdef _WIN32\n#include <windows.h>\n#endif\n"],
      [PUB, "// #ifdef _WIN32\n#include \"ergo/render/vk_fwd.h\"\n"],
    ],
  },
  "platform-if-count": {
    pos: [["src/custos/http_server.cpp", "#ifdef _WIN32\n#endif\nint a;\n#if defined(__APPLE__)\n#endif\n#ifndef _WIN32\n#endif\n", [6]]],
    neg: [
      ["src/custos/http_server.cpp", "#ifdef _WIN32\n#endif\n#if defined(__APPLE__)\n#endif\n// #ifdef __linux__\n"],
      ["src/custos/http_server_win.cpp", "#ifdef _WIN32\n#endif\n#ifdef _WIN32\n#endif\n#ifdef _WIN32\n#endif\n"],
    ],
  },
  "header-default-macro": {
    pos: [["include/ergo/math/batch.h", "#pragma once\n#ifndef ERGO_MATH_SIMD\n#define ERGO_MATH_SIMD 1\n#endif\n", [2]]],
    neg: [
      ["include/ergo/math/vec.h", "#ifndef ERGO_MATH_VEC_H\n#define ERGO_MATH_VEC_H\n#endif\n"],
      ["src/math/batch_impl.h", "#ifndef ERGO_MATH_SIMD\n#define ERGO_MATH_SIMD 1\n#endif\n"],
    ],
  },
  "string-err-out": {
    pos: [[PUB, "bool load(const std::string& path, std::string* err);\nbool save(std::string *error_out);\n", [1, 2]]],
    neg: [[PUB, "void name(std::string* name);\n// bool load(std::string* err);\n"]],
  },
  "raw-pimpl": {
    pos: [[SRC, "Engine::Engine() : impl_(new Impl()) {}\nEngine::~Engine() { delete impl_; }\n", [1, 2]]],
    neg: [[SRC, "Engine::Engine() : impl_(std::make_unique<Impl>()) {}\n// delete impl_;\n"]],
  },
  "release-outside-helper": {
    pos: [["src/net/quic/msquic_transport.cpp", "auto* raw = buffer.release();\nsend(conn, impl_->buf.release());\nreturn owned.release();\n", [1, 2, 3]]],
    neg: [
      ["src/net/quic/send_buffer_handoff.h", "auto* raw = buffer.release();\n"],
      ["src/net/quic/msquic_transport.cpp", "lock.release_all();\n// auto* p = buffer.release();\nvideo.release();\nif (open) impl_->cap.release();\nbb.release(\"stage\");\n"],
    ],
  },
  "view-member": {
    pos: [[PUB, "struct Packet {\n  std::string_view name;\n};\nclass Reader {\n  std::span<const std::byte> data_;\n};\n", [2, 5]]],
    neg: [[PUB, [
      "struct NameView { std::string_view name; };",
      "class Reader {",
      "  static constexpr std::string_view kName = \"r\";",
      "  void read(std::string_view text);",
      "  std::string name_;",
      "};",
    ].join("\n")]],
  },
  "thread-safety-note": {
    pos: [
      ["include/ergo/log/log.h", "class Logger {\n  std::mutex mutex_;\n};\n", [2], { addedLines: [1] }],
      ["include/ergo/log/log.h", "const char* s = \"Thread-safety: thread-safe\";\nclass Logger {\n  std::atomic<bool> on_{false};\n};\n", [3]],
    ],
    neg: [
      ["include/ergo/log/log.h", "// Thread-safety: thread-safe。再入不可。\nclass Logger {\n  std::mutex mutex_;\n};\n"],
      ["include/ergo/log/log.h", "class Logger {\n  void lock(std::mutex& m);\n};\n"],
    ],
  },
  singleton: {
    pos: [
      [SRC, "static Engine& instance();\n", [1]],
      [SRC, "// FOO_ALLOW_GLOBAL: 理由\nstatic Engine& instance();\n", [2], { config: { prefix: "ERGO" } }],
    ],
    neg: [
      [SRC, "// ERGO_ALLOW_GLOBAL: ログの出力先 (§C6.7)\nstatic Logger& instance();\n"],
      [SRC, "// static Engine& instance();\nEngine& engine = ctx.engine();\n"],
    ],
  },
  "trunc-write": {
    pos: [[SRC, "std::ofstream out(path,\n    std::ios::binary | std::ios::trunc);\n", [1]]],
    neg: [
      ["src/io/atomic_write.cpp", "std::ofstream out(tmp, std::ios::binary | std::ios::trunc);\n"],
      [SRC, "std::ifstream in(path);\n// std::ofstream out(p, std::ios::trunc);\n"],
    ],
  },
  "remove-before-rename": {
    pos: [[SRC, "fs::remove_all(dir);\nfs::rename(partial, dir);\n", [1]]],
    neg: [[SRC, "fs::remove_all(cache_dir);\nreturn true;\n"], ["src/io/atomic_write.cpp", "fs::remove_all(dir);\nfs::rename(partial, dir);\n"]],
  },
  "logic-random": {
    pos: [["src/world/game_variation.cpp", "std::uniform_int_distribution<int> d(0, 9);\n", [1], { config: LOGIC }]],
    neg: [
      ["src/render/sparkle.cpp", "std::uniform_int_distribution<int> d(0, 9);\n", { config: LOGIC }],
      ["src/world/game_variation.cpp", "std::uniform_int_distribution<int> d(0, 9);\n"],
      ["src/world/game_variation.cpp", "// std::uniform_int_distribution<int> d;\n", { config: LOGIC }],
    ],
  },
  "logic-random-device": {
    pos: [["src/world/seed.cpp", "std::random_device rd;\n", [1], { config: LOGIC }]],
    neg: [["src/app/nonce.cpp", "std::random_device rd;\n", { config: LOGIC }]],
  },
  "logic-clock": {
    pos: [["src/world/tick.cpp", "auto t = std::chrono::steady_clock::now();\n", [1], { config: LOGIC }]],
    neg: [
      ["src/app/profile.cpp", "auto t = std::chrono::steady_clock::now();\n", { config: LOGIC }],
      ["src/world/tick.cpp", "// steady_clock::now()\nvoid step(float dt);\n", { config: LOGIC }],
    ],
  },
  "logic-libm": {
    pos: [["src/world/scene/enemy_remap.cpp", "float a = std::sin(x);\nfloat b = powf(x, 2.0f);\n", [1, 2], { config: LOGIC }]],
    neg: [
      ["src/world/scene/enemy_remap.cpp", "float a = ergo::det::sin(x);\nfloat b = v.cos();\n", { config: LOGIC }],
      ["src/render/wave.cpp", "float a = std::sin(x);\n", { config: LOGIC }],
    ],
  },
  "using-namespace-header": {
    pos: [[PUB, "namespace ergo {\ninline void f() { using namespace std::literals; }\n}\nusing namespace std;\n", [2, 4]]],
    neg: [["src/net/socket.cpp", "using namespace std::literals;\n"], [PUB, "// using namespace std;\n"]],
  },
  "positional-config": {
    pos: [[SRC, "auto cfg = AudioConfig{48000, 2};\nRenderDesc desc{1, 2};\nVkBufferCreateInfo info = {a, b};\n", [1, 2, 3]]],
    neg: [[SRC, [
      "auto cfg = AudioConfig{ .sample_rate = 48000, .channels = 2 };",
      "struct AudioConfig {",
      "  int a = 0, b = 0;",
      "};",
      "struct Child : public BaseConfig { int a, b; };",
      "AudioConfig empty{};",
      "AudioConfig copy{other};",
      "auto make() -> AudioConfig { return {}; }",
      "// AudioConfig{1, 2}",
    ].join("\n")]],
  },
  "direct-output": {
    pos: [[SRC, "std::cerr << \"x\";\nfprintf(stderr, \"x\");\nprintf(\"x\");\n", [1, 2, 3], { config: { logger: { files: ["src/log/log.cpp"] } } }]],
    neg: [
      ["src/log/log.cpp", "std::cerr << \"x\";\n", { config: { logger: { files: ["src/log/log.cpp"] } } }],
      ["tools/pack/main.cpp", "std::cout << \"x\";\n", { config: { logger: { files: ["src/log/log.cpp"] } } }],
      [SRC, "std::cerr << \"x\";\n"],
      [SRC, "snprintf(buf, sizeof(buf), \"x\");\n// std::cerr << x;\n", { config: { logger: { files: ["src/log/log.cpp"] } } }],
    ],
  },
  "sdk-in-public-header": {
    pos: [["include/ergo/particle/renderer.h", "#include <vulkan/vulkan.h>\n#include <windows.h>\n", [1, 2]]],
    neg: [
      ["include/ergo/particle/renderer.h", "#include \"ergo/render/vk_fwd.h\"\n// #include <vulkan/vulkan.h>\n"],
      ["include/pictor/gpu/device.h", "#include <vulkan/vulkan.h>\n", { config: { publicIncludeAllow: ["vulkan"] } }],
      ["src/particle/renderer.h", "#include <vulkan/vulkan.h>\n"],
    ],
  },
  "nolint-form": {
    pos: [[SRC, [
      "int a = 0; // NOLINT",
      "int b = 0; // NOLINT(bugprone-foo)",
      "// NOLINTNEXTLINE(bugprone-foo): (§C2.1)",
      "int c = 0; // NOLINT(): 理由 (§C1.1)",
      "// NOLINTBEGIN(bugprone-foo): 理由",
    ].join("\n"), [1, 2, 3, 4, 5]]],
    neg: [[SRC, [
      "int a = 0; // NOLINT(bugprone-empty-catch): 境界の最上位 (§C5.6)",
      "// NOLINTBEGIN(bugprone-foo, cert-err33-c): 生成コード (§C9.4)",
      "// NOLINTEND(bugprone-foo, cert-err33-c)",
      "const char* s = \"NOLINT\";",
    ].join("\n")]],
  },
  "pragma-disable": {
    pos: [
      ["src/log/log.cpp", "#pragma warning(disable: 4774)\n", [1]],
      ["src/log/log.cpp", "#pragma warning(push)\n// C4774: vsnprintf 転送 (§C2.1)\n#pragma warning(disable: 4774)\n", [3]],
      ["src/log/log.cpp", "#pragma clang diagnostic push\n#pragma clang diagnostic ignored \"-Wformat-nonliteral\"\n#pragma clang diagnostic pop\n", [2]],
    ],
    neg: [[
      "src/log/log.cpp",
      [
        "#pragma warning(push)",
        "// C4774: ロガーの vsnprintf 転送 (§C2.1)",
        "#pragma warning(disable: 4774)",
        "int n = vsnprintf(buf, sizeof(buf), fmt, ap);",
        "#pragma warning(pop)",
        "#pragma clang diagnostic push",
        "// -Wformat-nonliteral: ロガーの転送 (§C2.1)",
        "#pragma clang diagnostic ignored \"-Wformat-nonliteral\"",
        "#pragma clang diagnostic pop",
      ].join("\n"),
    ]],
  },
};

for (const [name, { pos, neg }] of Object.entries(CASES)) {
  test(`${name}: 肯定例を検出する`, () => {
    for (const [file, source, expected, options] of pos) {
      assert.deepEqual(linesOf(name, file, source, options), expected, `${file}`);
    }
  });
  test(`${name}: 否定例を検出しない`, () => {
    for (const [file, source, options] of neg) {
      assert.deepEqual(linesOf(name, file, source, options), [], `${file}`);
    }
  });
}

// ---- 変更集合の規則 ----

const CHANGESET_CASES = {
  "shader-layout-sync": {
    pos: [[[{ file: "shaders/particle_update.comp", source: "struct Particle {\n  vec4 pos;\n};\nvoid main() {}\n", addedLines: [2] }], ["shaders/particle_update.comp:2"]],
      [[{ file: "shaders/include/particle.glsl", source: "layout(std430, binding = 0) buffer P { vec4 p[]; };\n", addedLines: null },
        { file: "include/ergo/gpu_particle/particle_state.h", source: "struct ParticleState {};\n", addedLines: [1] }], ["shaders/include/particle.glsl:1"]]],
    neg: [
      [[{ file: "shaders/particle_update.comp", source: "struct Particle {\n  vec4 pos;\n};\n", addedLines: [2] },
        { file: "include/ergo/gpu_particle/particle_state.h", source: "struct ParticleState {};\n", addedLines: [1] },
        { file: "tests/gpu_particle/test_shader_layout_gpu_particle.cpp", source: "TEST(A, B) {}\n", addedLines: [1] }]],
      [[{ file: "shaders/particle_update.comp", source: "struct Particle {\n  vec4 pos;\n};\nvoid main() {\n  x += 1;\n}\n", addedLines: [5] }]],
      [[{ file: "shaders/particle_update.comp", source: "// struct と buffer の説明\nvoid main() {}\n", addedLines: [1] }]],
    ],
  },
  "concept-tests": {
    pos: [[[{ file: "include/ergo/math/concepts.h", source: "template <typename T>\nconcept Scalar = true;\n", addedLines: [2] }], ["include/ergo/math/concepts.h:2"]]],
    neg: [
      [[{ file: "include/ergo/math/concepts.h", source: "template <typename T>\nconcept Scalar = true;\n", addedLines: [2] },
        { file: "tests/math/test_math_concepts.cpp", source: "static_assert(!ergo::math::Scalar<bool>);\n", addedLines: [1] }]],
      [[{ file: "include/ergo/math/vec.h", source: "int x;\n", addedLines: [1] }]],
    ],
  },
  "fuzz-harness": {
    pos: [
      [[{ file: "src/sound/audio_decoder.cpp", source: "int x;\n", addedLines: [1] }], ["src/sound/audio_decoder.cpp:1"]],
      [[{ file: "src/scene/scene_loader.cpp", source: "int x;\n", addedLines: [1] },
        { file: "native/src/world/riddle/save_store.cpp", source: "int x;\n", addedLines: [1] }],
       ["src/scene/scene_loader.cpp:1", "native/src/world/riddle/save_store.cpp:1"]],
    ],
    neg: [
      [[{ file: "src/sound/audio_decoder.cpp", source: "int x;\n", addedLines: [1] }], { repoFiles: ["fuzz/sound/fuzz_audio_decoder.cpp"] }],
      [[{ file: "src/sound/audio_decoder.cpp", source: "int x;\n", addedLines: [1] },
        { file: "fuzz/sound/fuzz_wav.cpp", source: "extern \"C\" int LLVMFuzzerTestOneInput(const uint8_t*, size_t) { return 0; }\n", addedLines: null }]],
      [[{ file: "native/src/world/protocol/codec.cpp", source: "int x;\n", addedLines: [1] }], { repoFiles: ["native/fuzz/world/fuzz_codec.cpp"] }],
      [[{ file: "tests/sound/test_audio_decoder.cpp", source: "int x;\n", addedLines: [1] }]],
      // §C1.8 の実行時ロード (*_loader.cpp) はデコーダではない
      [[{ file: "native/src/input/mediapipe_loader.cpp", source: "int x;\n", addedLines: [1] }]],
    ],
  },
};

for (const [name, { pos, neg }] of Object.entries(CHANGESET_CASES)) {
  test(`${name}: 肯定例を検出する (変更集合)`, () => {
    for (const [changes, expected, options] of pos) assert.deepEqual(changesetLinesOf(name, changes, options), expected);
  });
  test(`${name}: 否定例を検出しない (変更集合)`, () => {
    for (const [changes, options] of neg) assert.deepEqual(changesetLinesOf(name, changes, options), []);
  });
}

// ---- 表の構造 ----

test("全規則に肯定例と否定例がある", () => {
  const covered = { ...CASES, ...CHANGESET_CASES };
  for (const rule of rules) {
    assert.ok(covered[rule.name], `テストのない規則: ${rule.name}`);
    assert.ok(covered[rule.name].pos.length > 0 && covered[rule.name].neg.length > 0, `${rule.name}`);
  }
  for (const name of Object.keys(covered)) assert.ok(rules.some((r) => r.name === name), `存在しない規則のテスト: ${name}`);
});

test("規則表の各エントリは必須欄を持ち、名前が一意", () => {
  const names = new Set();
  for (const rule of rules) {
    assert.match(rule.id, /^C[1-9]\.\d+$/, rule.name);
    assert.ok(!names.has(rule.name), `重複: ${rule.name}`);
    names.add(rule.name);
    assert.ok(["error", "warn"].includes(rule.severity), rule.name);
    assert.ok(["added-lines", "file", "changeset"].includes(rule.scope), rule.name);
    assert.ok(rule.files instanceof RegExp, rule.name);
    assert.ok(rule.pattern instanceof RegExp || typeof rule.check === "function", rule.name);
    assert.ok(rule.scope !== "changeset" || typeof rule.check === "function", rule.name);
    for (const key of ["title", "message", "why"]) assert.ok(typeof rule[key] === "string" && rule[key].length > 0, `${rule.name}.${key}`);
  }
});

test("規則表の §C 番号は RULE_CODE_CPP.md に実在する", { skip: !existsSync(path.join(HERE, "../../RULE_CODE_CPP.md")) }, () => {
  const doc = readFileSync(path.join(HERE, "../../RULE_CODE_CPP.md"), "utf8");
  for (const id of new Set(rules.map((r) => r.id))) {
    assert.match(doc, new RegExp(`\\*\\*§${id.replace(".", "\\.")}[\\s*]`), `RULE_CODE_CPP.md に §${id} の見出しがない`);
  }
});

// ---- マスク ----

test("maskCommentsAndLiterals: 行番号と長さを保ち、コメントとリテラルだけを空白にする", () => {
  const src = [
    "int a = 1'000'000; // atoi(",
    "const char* s = \"strcpy(\\\"x\\\")\"; char c = '\\'';",
    "auto r = R\"d(line1 \" // )\n atoi( )d\"; int b = atoi(x);",
    "/* sscanf(",
    "   */ int z = u8'a' + L'b';",
    "#include \"keep/me.h\"",
    "// cont \\",
    "  continued atoi(",
    "int after = 0;",
  ].join("\n");
  const masked = maskCommentsAndLiterals(src);
  assert.equal(masked.length, src.length);
  assert.equal(masked.split("\n").length, src.split("\n").length);
  assert.ok(!/strcpy|sscanf|continued/.test(masked));
  assert.equal((masked.match(/atoi\(/g) ?? []).length, 1, "raw 文字列の外の 1 件だけが残る");
  assert.match(masked, /int a = 1'000'000;/);
  assert.match(masked, /#include "keep\/me\.h"/);
  assert.match(masked, /int after = 0;/);
});

test("maskCommentsAndLiterals: keepComments はコメントを残してリテラルだけ消す", () => {
  const masked = maskCommentsAndLiterals("int a; // NOLINT(x): y (§C1.1)\nauto s = \"NOLINT\";\n", { keepComments: true });
  assert.match(masked, /\/\/ NOLINT\(x\): y \(§C1\.1\)/);
  assert.ok(!/"NOLINT"/.test(masked));
});

test("maskCommentsAndLiterals: CMake はコメントだけを消し、引用引数は残す", () => {
  const src = "# include_directories(x)\nset(A \"/utf-8 # not comment\")\n#[[ file(GLOB x)\n]] add_compile_options([[/W4]])\n";
  const masked = maskCommentsAndLiterals(src, { language: "cmake" });
  assert.equal(masked.length, src.length);
  assert.ok(!/include_directories|GLOB/.test(masked));
  assert.match(masked, /set\(A "\/utf-8 # not comment"\)/);
  assert.match(masked, /add_compile_options\(\[\[\/W4\]\]\)/);
});

// ---- 抑制・範囲・漏洩 ----

test("NOLINT(cpp-rules-<id>) で抑制でき、NEXTLINE と BEGIN/END も効く", () => {
  const src = [
    "// NOLINTNEXTLINE(cpp-rules-C1.2): 旧 API (§C1.2)",
    "using A = std::enable_if_t<true>;",
    "// NOLINTBEGIN(cpp-rules-C1.2): 生成コード (§C1.2)",
    "using B = std::enable_if_t<true>;",
    "// NOLINTEND(cpp-rules-C1.2)",
    "using C = std::enable_if_t<true>;",
  ].join("\n");
  assert.deepEqual(linesOf("sfinae", PUB, src), [6]);
});

test("追加行に無い finding は報告しない、削除だけの変更は何も報告しない", () => {
  const src = "int a = atoi(x);\nint b = atoi(y);\n";
  assert.deepEqual(linesOf("banned-api", SRC, src, { addedLines: [2] }), [2]);
  assert.deepEqual(scanSource(SRC, src, { addedLines: [] }), []);
});

test("finding はソース抜粋を持たない (行番号と固定文言だけ)", () => {
  const src = "int SECRET_TOKEN_ABC = atoi(\"hunter2\");\n";
  const findings = scanSource(SRC, src);
  assert.ok(findings.length > 0);
  for (const f of findings) assert.deepEqual(Object.keys(f).sort(), ["file", "id", "line", "message", "rule", "severity"]);
  assert.ok(!/SECRET_TOKEN_ABC|hunter2/.test(JSON.stringify(findings)));
});

test("対象外の拡張子と third_party は見ない", () => {
  assert.deepEqual(scanSource("README.md", "atoi(x)"), []);
  assert.deepEqual(scanSource("third_party/gtest/gtest.h", "int x = atoi(s);\n"), []);
  assert.deepEqual(scanSource("native\\third_party\\a.cpp", "int x = atoi(s);\n"), []);
});

// ---- 設定 ----

test("parseRepoConfig: 未知のキー・理由のない disable・存在しない規則は例外", () => {
  assert.throws(() => parseRepoConfig({ logicDir: ["src/world/"] }), /未知のキー/);
  assert.throws(() => parseRepoConfig({ disable: { "C3.1": "" } }), /理由/);
  assert.throws(() => parseRepoConfig({ disable: { "C99.1": "x" } }), /存在しない規則/);
  assert.throws(() => parseRepoConfig({ prefix: "ergo" }), /prefix/);
  assert.throws(() => parseRepoConfig({ logger: { file: ["a"] } }), /logger/);
  assert.equal(parseRepoConfig({ disable: { "fuzz-harness": "生成コードのみ" } }).disable.size, 1);
});

test("parseRepoConfig: suppressible: false の規則は disable できない (§C9.4 / §C9.5)", () => {
  const locked = rules.filter((r) => r.suppressible === false);
  assert.ok(locked.length > 0);
  for (const r of locked) {
    assert.throws(() => parseRepoConfig({ disable: { [r.name]: "x" } }), /無効にできない/, r.name);
    assert.throws(() => parseRepoConfig({ disable: { [r.id]: "x" } }), /無効にできない/, r.id);
  }
  // 同じ §C に抑制できる規則しか無いものは §C 番号でも無効にできる (Pictor の §C3.1 など)
  assert.equal(parseRepoConfig({ disable: { "C3.1": "Pictor は Ergo の下位で循環依存になる" } }).disable.size, 1);
  assert.equal(parseRepoConfig({ disable: { "loader-outside": "ローダ集約前の移行期間" } }).disable.size, 1);
});

// ---- diff ----

test("parseUnifiedDiff: 追加行だけを取り、内容が '++' で始まる行も誤認しない", () => {
  const diff = [
    "diff --git a/src/a.cpp b/src/a.cpp",
    "--- a/src/a.cpp",
    "+++ b/src/a.cpp",
    "@@ -3,0 +4,2 @@ ctx",
    "+++ x;",
    "+int y;",
    "@@ -10 +12 @@",
    "-old",
    "+new",
    "diff --git a/src/gone.cpp b/src/gone.cpp",
    "--- a/src/gone.cpp",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    "-a",
    "-b",
    "diff --git a/\"src/\\346\\227\\245.cpp\" b/\"src/\\346\\227\\245.cpp\"",
    "--- a/\"src/\\346\\227\\245.cpp\"",
    "+++ \"b/src/\\346\\227\\245.cpp\"",
    "@@ -0,0 +1 @@",
    "+int z;",
    "\\ No newline at end of file",
  ].join("\n");
  const files = parseUnifiedDiff(diff);
  assert.deepEqual([...files.keys()], ["src/a.cpp", "src/日.cpp"]);
  assert.deepEqual([...files.get("src/a.cpp")], [4, 5, 12]);
  assert.deepEqual([...files.get("src/日.cpp")], [1]);
});

// ---- CLI ----

function sh(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "init.defaultBranch=main", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function capture() {
  let text = "";
  return { write: (s) => { text += s; }, get text() { return text; } };
}

test("CLI: merge-base からの追加行だけを検査し、finding があれば 1", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cpp-rules-"));
  try {
    sh(dir, "init", "-q");
    mkdirSync(path.join(dir, "src/app"), { recursive: true });
    writeFileSync(path.join(dir, "src/app/legacy.cpp"), "int legacy = atoi(s);\n");
    sh(dir, "add", ".");
    sh(dir, "commit", "-q", "-m", "base");
    sh(dir, "checkout", "-q", "-b", "feat/x");

    let out = capture(), err = capture();
    assert.equal(main([dir, "--base", "main"], { stdout: out, stderr: err }), 0, err.text);

    writeFileSync(path.join(dir, "src/app/legacy.cpp"), "int legacy = atoi(s);\nint SECRET_TOKEN_ABC = std::stoi(t);\n");
    writeFileSync(path.join(dir, "src/app/new.h"), "using namespace std;\n");
    out = capture(); err = capture();
    assert.equal(main([dir, "--base", "main"], { stdout: out, stderr: err }), 1);
    assert.match(out.text, /src\/app\/legacy\.cpp:2: error \[§C2\.2 std-sto\]/);
    assert.match(out.text, /src\/app\/new\.h:1: error \[§C8\.2 using-namespace-header\]/);
    assert.ok(!/legacy\.cpp:1:/.test(out.text), "既存行は対象外");
    assert.ok(!/SECRET_TOKEN_ABC/.test(out.text));

    out = capture(); err = capture();
    assert.equal(main([dir, "--base", "no-such-ref"], { stdout: out, stderr: err }), 1);
    assert.match(err.text, /merge-base/);

    writeFileSync(path.join(dir, "cpp-rules.json"), "{ \"unknown\": 1 }");
    out = capture(); err = capture();
    assert.equal(main([dir, "--base", "main"], { stdout: out, stderr: err }), 1);
    assert.match(err.text, /未知のキー/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
