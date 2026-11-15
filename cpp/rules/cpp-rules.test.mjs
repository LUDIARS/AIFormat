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
  languageOf,
  maskCommentsAndLiterals,
  PATHS,
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
    pos: [
      [PUB, "bool parse(const uint8_t* data, size_t size);\nvoid send(int id,\n          const void* bytes, std::size_t n);\n", [1, 3]],
      // `(` / `,` の後のコメントと、1 つの宣言に並んだ 2 組 (先の一致が後の組の `,` を食わない)
      [PUB, "void copy(/* in */ const char* a, size_t n,\n          const char* b, size_t m);\n", [1, 2]],
    ],
    neg: [
      ["src/world/proto/datagram.h", "bool parse(const uint8_t* data, size_t size);\n"],
      [PUB, "bool parse(std::span<const std::byte> data);\n// bool parse(const uint8_t* data, size_t size);\n"],
    ],
  },
  "vector-param": {
    pos: [[PUB, "void set(const std::vector<int>& values);\nvoid zip(const std::vector<int>& a,\n         const std::vector<int>& b);\n", [1, 2, 3]]],
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
      [SRC, "int n = atoi(s);\nstd::sscanf(buf, \"%d\", &x);\nchar* t = strtok(a, b);\nint r = rand();\n", [1, 2, 3, 4]],
      [SRC, "int n = atoi(s); // NOLINT(cpp-rules-C2.1): 既存 (§C2.1)\n", [1]],
      // Revisor と同じ呼び出しの形: 大域修飾・括弧で囲んだ名前・コメントや行継続を挟んだ呼び出し
      [SRC, "int a = ::atoi(s);\nint b = (atoi)(s);\nint c = ((std::atoi))(s);\nreturn ::rand();\nint d = atoi /* x */ (s);\nint e = atoi\\\n(s);\n", [1, 2, 3, 4, 5, 6]],
      ["src/net/x.c", "int n = atol(s);\n", [1]],
      ["src/net/x.c++", "int n = atoi(s);\n", [1]],
      ["include/ergo/net/x.h++", "inline int f(const char* s) { return atoi(s); }\n", [1]],
      ["include/ergo/net/x.tcc", "int n = atoi(s);\n", [1]],
      ["src/platform/x.m", "int n = atoi(s);\n", [1]],
    ],
    neg: [
      [SRC, "int a = rng.rand();\nint b = my::atoi(x);\nint c = ptr->rand();\nconst char* s = \"atoi(\";\n// atoi(a, b);\nint n = snprintf(buf, sizeof(buf), \"%d\", v);\noperand(x);\n"],
      // banned.h の形の防御は使用ではない (Revisor の native.unbounded-copy と同じ除外)
      [SRC, "#define atoi(...) ATOI_IS_BANNED\n#undef rand\n# define strtok(s, d) strtok_is_banned(s, d)\n%:define srand(x) SRAND_IS_BANNED\n"],
      // Praesidium が関数ごと拒否するもの (strcpy 系・alloca 系) は Praesidium に任せる
      [SRC, "strcpy(a, b);\nsprintf(buf, f, x);\nvoid* p = alloca(n);\n"],
      // .inc / .def の断片は単独では見ない (Praesidium と同じ)
      ["src/net/table.inc", "int n = atoi(s);\n"],
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
      // #if defined(_MSC_VER) の外の #pragma warning は clang / GCC の -Wunknown-pragmas になる
      ["src/log/log.cpp", "#pragma warning(push)\n// C4774: vsnprintf 転送 (§C2.1)\n#pragma warning(disable: 4774)\n#pragma warning(pop)\n", [1, 3, 4]],
      ["src/log/log.cpp", "#if defined(_MSC_VER)\n#pragma warning(push)\n#pragma warning(disable: 4774)\n#pragma warning(pop)\n#endif\n", [3]],
      ["src/log/log.cpp", "#ifdef _MSC_VER\n// C4774: vsnprintf 転送 (§C2.1)\n#pragma warning(disable: 4774)\n#endif\n", [3]],
      ["src/log/log.cpp", "#ifdef _MSC_VER\n#pragma warning(suppress: 4996)\n#pragma warning(push, 0)\n#pragma warning(4: 4996)\n#pragma warning(pop)\n#endif\n", [2, 3, 4]],
      ["src/log/log.cpp", "#if defined(_MSC_VER)\n#else\n#pragma warning(push)\n#pragma warning(pop)\n#endif\n", [3, 4]],
      ["src/log/log.cpp", "#if _MSC_VER < 1900 || defined(_MSC_VER)\n#pragma warning(push)\n#endif\n%:pragma warning(pop)\n", [2, 4]],
      // 行継続の後ろの行だけを追加しても、指令 (# の行) として報告する
      ["src/log/log.cpp", "#pragma warning \\\n  (disable: 4996)\n", [1], { addedLines: [2] }],
    ],
    neg: [[
      "src/log/log.cpp",
      [
        "#if defined(_MSC_VER)",
        "#pragma warning(push)",
        "// C4774: ロガーの vsnprintf 転送 (§C2.1)",
        "#pragma warning(disable: 4774)",
        "#endif",
        "int n = vsnprintf(buf, sizeof(buf), fmt, ap);",
        "#if defined(_MSC_VER) && !defined(__clang__)",
        "#pragma warning(error: 4996)",
        "#endif",
        "#ifndef _MSC_VER",
        "int posix = 1;",
        "#elif _MSC_VER >= 1930",
        "#pragma warning(default: 4996)",
        "#else",
        "#pragma warning(once: 4996)",
        "#endif",
        "#ifdef _MSC_VER",
        "#pragma warning(pop)",
        "#endif",
        "// #pragma warning(disable: 1)",
        "const char* s = \"#pragma warning(push)\";",
      ].join("\n"),
    ]],
  },
  "analysis-suppression": {
    pos: [
      // 理由と push / pop があっても clang / GCC の抑制は使えない
      ["src/log/log.cpp", "#pragma clang diagnostic push\n// -Wformat-nonliteral: ロガーの転送 (§C2.1)\n#pragma clang diagnostic ignored \"-Wformat-nonliteral\"\n#pragma clang diagnostic pop\n", [3]],
      ["src/net/x.h", "#pragma GCC diagnostic warning \"-Wformat\"\n#pragma system_header\n#pragma GCC system_header\n#  pragma clang system_header\n", [1, 2, 3, 4]],
      [SRC, "_Pragma(\"clang diagnostic ignored \\\"-Wall\\\"\")\n#define QUIET __pragma(warning(disable: 4996))\n", [1, 2]],
      [SRC, "[[clang::suppress]] int a = f();\n[[ clang :: suppress(\"x\") ]] int b;\n__attribute__((suppress)) int c;\n<:<:clang::suppress:>:> int d;\n[[\n  clang::suppress\n]] int e;\n", [1, 2, 3, 4, 6]],
      ["src/net/x.c", "#ifndef __clang_analyzer__\nint x;\n#endif\n", [1]],
      // 行継続・コメント・ダイグラフを挟んだ書き方 (プリプロセッサの論理行で読む)。名前の途中の行継続
      // (`diag\` + 改行 + `nostic`) は Praesidium の native.identifier-splice が拒否する
      [SRC, "#pragma clang \\\ndiagnostic ignored \"-Wall\"\n#/**/pragma GCC diagnostic ignored \"-Wx\"\n%:pragma GCC diagnostic ignored \"-Wx\"\n/* a\n b */ #pragma GCC diagnostic ignored \"-Wx\"\n", [1, 3, 4, 6]],
      // 行継続の後ろの行 (どの警告を消すか) だけを追加しても、指令 (# の行) として報告する
      [SRC, "#pragma clang \\\ndiagnostic ignored \"-Wall\"\n", [1], { addedLines: [2] }],
      [SRC, "#pragma GCC diagnostic ignored \\\n  \"-Wformat\"\nint x;\n", [1], { addedLines: [2] }],
    ],
    neg: [[SRC, [
      "// #pragma clang diagnostic ignored \"-Wall\"",
      "const char* s = \"_Pragma __clang_analyzer__ [[clang::suppress]]\";",
      "#pragma clang diagnostic push",
      "#pragma clang diagnostic error \"-Wformat\"",
      "#pragma clang diagnostic pop",
      "[[gsl::suppress(\"type.1\")]] int a;",
      "int suppress = 0;",
      "obj.suppress();",
      "int v = arr[suppress];",
      "#pragma once",
    ].join("\n")]],
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
    assert.ok(typeof rule.files?.test === "function", rule.name);
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

test("maskCommentsAndLiterals: keepComments はリテラルの中の // や NOLINT を残さない (raw 文字列・行継続を含む)", () => {
  const src = "auto r = R\"x(\n// NOLINT(a): b (§C1.1)\n)x\"; // NOLINT(c): d (§C1.1)\nconst char* s = \"a\\\r\n// NOLINT(e)\"; int k = 1'000; char q = '\"';\n";
  const masked = maskCommentsAndLiterals(src, { keepComments: true });
  assert.equal(masked.length, src.length);
  assert.ok(!/NOLINT\((?:a|e)\)/.test(masked), "raw 文字列と CR LF の行継続で続くリテラルの中身は消える");
  assert.match(masked, /\/\/ NOLINT\(c\): d/);
  assert.match(masked, /int k = 1'000; char q = ' ';/);
  // 接頭辞と引用符の間に行継続がある raw 文字列も、中身だけを消す
  const spliced = maskCommentsAndLiterals("auto r = R\\\n\"x(\n// NOLINT(a)\n)x\"; // NOLINT(c)\n", { keepComments: true });
  assert.ok(!/NOLINT\(a\)/.test(spliced) && /NOLINT\(c\)/.test(spliced));
});

// ---- 字句処理: Revisor native-lexer の同期コピーで、旧マスクの回避を塞ぐ ----

test("字句処理: 旧マスクで後続のコードが隠れた書き方でも禁止 API を見つける", () => {
  const cases = [
    // header-name の中の /* はコメントを開かない
    [SRC, "#include <x/*y>\nint n = atoi(s);\n/* */\n", [2]],
    // CR LF の前の \ と、\ と改行の間の空白は行継続 (リテラルは次の行へ続き、閉じた後はコード)
    [SRC, "const char* s = \"a\\\r\nb\"; int n = atoi(s);\r\n", [2]],
    [SRC, "const char* s = \"a\\  \nb\"; int n = atoi(s);\n", [2]],
    // 単独の CR も行の終わり (行コメントはそこで終わる)
    [SRC, "// note\r int n = atoi(s);\n", [1]],
    // 非 ASCII の識別子に続く R" は raw 文字列の接頭辞ではない
    [SRC, "#define \u00e9R\nconst char* p = \u00e9R\"(x\";\nint n = atoi(s);\nconst char* q = \")\";\n", [3]],
    // 閉じない raw 文字列は行末までしか隠さない
    [SRC, "auto s = R\"(abc\nint n = atoi(s);\n", [2]],
    // C に raw 文字列は無い (R は名前)。C17 では 1'0' の ' は文字リテラル
    ["src/net/x.c", "const char* s = R\"(\";\nint n = atoi(s);\n// )\"\n", [2]],
    ["src/net/x.c", "int x = 1'0'; int n = atoi(s);\n", [1]],
    // ヘッダは C と C++ のどちらでも読まれうるので、各読み方の finding を合算する
    ["include/ergo/net/x.h", "const char* s = R\"(\";\nint n = atoi(s);\n// )\"\n", [2]],
  ];
  for (const [file, source, expected] of cases) {
    assert.deepEqual(linesOf("banned-api", file, source), expected, JSON.stringify(source));
  }
  // C++ では R"( ... )" が raw 文字列なので、中の atoi はコードではない
  assert.deepEqual(linesOf("banned-api", SRC, "const char* s = R\"(\";\nint n = atoi(s);\n// )\"\n"), []);
});

test("字句処理: リテラルの中の NOLINT では抑制できない (CR LF の行継続で続くリテラルを含む)", () => {
  assert.deepEqual(linesOf("reinterpret-cast", SRC,
    "auto p = reinterpret_cast<int*>(q); const char* s = \"// NOLINT(cppcoreguidelines-pro-type-reinterpret-cast): x (§C2.5)\";\n"), [1]);
  assert.deepEqual(linesOf("c-style-cast", SRC,
    "const char* s = \"a\\\r\n// NOLINT(cpp-rules-C2.6): x (§C2.6)\"; int v = (int)f;\r\n"), [2]);
});

test("ヘッダの C++ の規則は C++ の読み方だけで照合する (C の読み方の raw 文字列と桁区切りで誤検出しない)", () => {
  const rulesAt = (file, source) => scanSource(file, source).map((f) => `${f.rule}@${f.line}`);
  // C の読み方では raw 文字列の中身がコードになるが、キャストは C++ の規則なので C++ のコードとして読む
  const glsl = [
    "#pragma once",
    "inline constexpr const char* kFrag = R\"glsl(",
    "#version 450",
    "void main() {",
    "  int idx = int(uv.x * 4.0);",
    "  float f = (float)idx / 4.0;",
    "}",
    ")glsl\";",
    "",
  ].join("\n");
  assert.deepEqual(rulesAt("include/ergo/render/blit_shader.hpp", glsl), []);
  // C17 の読み方では 1'024 の ' から行末までが文字リテラルになり、行末の NOLINT が隠れる
  for (const check of ["cpp-rules-C2.5", "cppcoreguidelines-pro-type-reinterpret-cast"]) {
    const wire = `inline const std::byte* at(const void* b) { return reinterpret_cast<const std::byte*>(b) + 1'024; } // NOLINT(${check}): wire offset (§C2.5)\n`;
    for (const file of ["src/wire.hpp", "src/wire.h", "include/ergo/net/wire.h", "src/wire.cpp"]) assert.deepEqual(rulesAt(file, wire), [], `${file} ${check}`);
  }
  // C にも当てはまる規則 (禁止 API・抑制) は Praesidium と同じく全部の読み方で照合する: C の読み方では raw 文字列の中身もコード
  const snippet = [
    "#pragma once",
    "inline constexpr const char* kSnippet = R\"cpp(",
    "  int v = atoi(s);",
    "  auto* p = reinterpret_cast<int*>(q);",
    "  #pragma GCC diagnostic ignored \"-Wall\"",
    "  using namespace std;",
    ")cpp\";",
    "",
  ].join("\n");
  assert.deepEqual(rulesAt("src/snippet.hpp", snippet), ["banned-api@3", "analysis-suppression@5"]);
  assert.deepEqual(rulesAt("src/snippet.cpp", snippet), []);
});

test("finding の上限: 読み方ごとに打ち切っても、行の小さいほうから 200 件と finding-limit は変わらない", () => {
  // 2 行目の atoi は C の読み方でだけ見える (C++ では raw 文字列の中)。4 行目からの 300 行はどの読み方でも見える
  const source = "const char* s = R\"(\";\nint n = atoi(s);\n// )\"\n" + "int m = atoi(s);\n".repeat(300);
  const findings = scanSource("src/net/x.h", source);
  const expected = [2];
  for (let line = 4; expected.length < 200; line++) expected.push(line);
  assert.deepEqual(findings.slice(0, 200).map((f) => f.line), expected);
  assert.ok(findings.slice(0, 200).every((f) => f.rule === "banned-api"));
  assert.deepEqual(findings.slice(200).map((f) => `${f.rule}@${f.line}`), ["finding-limit@202"]);
});

test("拡張子の表は Revisor の languages.mjs と同じ (同期コピー)", () => {
  const cases = {
    "src/a.c": "cpp", "src/a.C": "cpp", "src/a.c++": "cpp", "src/a.cc": "cpp", "src/a.CPP": "cpp",
    "src/a.m": "cpp", "src/a.M": "cpp", "src/a.mm": "cpp",
    "src/a.ccm": "cpp", "src/a.cxxm": "cpp", "src/a.c++m": "cpp", "src/a.cppm": "cpp", "src/a.ixx": "cpp", "src/a.mpp": "cpp",
    "include/x/a.h++": "cpp", "include/x/a.tcc": "cpp", "include/x/a.H": "cpp", "include/x/a.ipp": "cpp",
    "src/a.inc": null, "src/a.def": null, "CMakeLists.txt": "cmake", "shaders/a.comp": "shader",
  };
  for (const [file, lang] of Object.entries(cases)) assert.equal(languageOf(file), lang, file);
  assert.ok(PATHS.cpp.test("src/a.c++") && !PATHS.cpp.test("src/a.c") && !PATHS.cpp.test("src/a.m"));
  assert.ok(PATHS.cpp.test("src/a.C") && PATHS.cpp.test("src/a.M"), "C と C++ のどちらにもなる .C / .M は C++ の規則にも掛ける");
  assert.ok(PATHS.header.test("include/x/a.h++") && PATHS.publicHeader.test("include/x/a.tcc") && !PATHS.header.test("src/a.inc"));
  assert.ok(PATHS.moduleUnit.test("src/a.c++m") && PATHS.source.test("src/a.c++") && PATHS.testSource.test("tests/x/a.c++"));
  assert.deepEqual(linesOf("module-unit-file", "src/math/vec.ccm", "int x;\n"), [1]);
  for (const synced of ["native-lexer.mjs", "languages.mjs"]) {
    const first = readFileSync(path.join(HERE, "lib", synced), "utf8").split("\n")[0];
    assert.match(first, new RegExp(`^// synced-from: LUDIARS/Revisor src/praesidium/${synced.replace(".", "\\.")} @ [0-9a-f]{7,}$`), synced);
  }
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

test("NOLINTBEGIN / END は check ごとに直前の注釈で判定し、BEGIN と同じ行や対応しない END は範囲にしない", () => {
  const src = [
    "// NOLINTBEGIN(cpp-rules-C1.2, cpp-rules-C2.6): 生成コード (§C1.2)",
    "using A = std::enable_if_t<true>; int a = (int)x;",
    "// NOLINTEND(cpp-rules-C2.6)",
    "using B = std::enable_if_t<true>; int b = (int)x;",
    "// NOLINTEND(cpp-rules-C1.2)",
    "using C = std::enable_if_t<true>; // NOLINTBEGIN(cpp-rules-C1.2): 同じ行は範囲外 (§C1.2)",
    "// NOLINTEND(cpp-rules-C1.*)",
    "using D = std::enable_if_t<true>;",
  ].join("\n");
  assert.deepEqual(linesOf("sfinae", PUB, src), [6, 8]);
  assert.deepEqual(linesOf("c-style-cast", PUB, src), [4]);
});

test("抑制注釈と #pragma の範囲は線形に求める (2 MiB の入力がフックの 3 秒に収まる)", () => {
  const MiB = 1024 * 1024;
  const repeat = (unit) => unit.repeat(Math.ceil(2 * MiB / unit.length));
  const inputs = {
    // 注釈の多いファイル: 行ごとに BEGIN / END と finding
    nolint: repeat("// NOLINTBEGIN(cpp-rules-C2.6): x (§C2.6)\nint a = (int)x;\n// NOLINTEND(cpp-rules-C2.6)\nint b = (int)y;\n"),
    // MSVC の push / disable / pop の入れ子
    pragma: "#if defined(_MSC_VER)\n" + repeat("#pragma warning(push)\n// C4774: x (§C2.1)\n#pragma warning(disable: 4774)\n") + "#endif\n",
    // 1 行に一致が並ぶ
    oneLine: repeat("int v = (int)x; ") + "\n",
    // 属性の括弧の入れ子と未閉じ
    brackets: repeat("[[ [ ( "),
  };
  for (const [name, source] of Object.entries(inputs)) {
    const started = process.hrtime.bigint();
    scanSource(SRC, source);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 3000, `${name}: ${ms.toFixed(0)} ms`);
  }
});

test("長い注釈の行と 3 つの読み方で読むヘッダも、2 MiB で 1.5 秒に収まる", () => {
  const MiB = 1024 * 1024;
  const fill = (unit) => unit.repeat(Math.ceil(2 * MiB / unit.length)).slice(0, 2 * MiB);
  const finding = "\nint* p = reinterpret_cast<int*>(q);\n";
  const inputs = [
    // 閉じない NOLINT( / NOLINTNEXTLINE( が並ぶ 1 行 (注釈の取り出しが後戻りしない)。抑制できる finding は抑制されない
    ["nolintParen", SRC, fill("NOLINT(") + finding, ["nolint-form@1", "reinterpret-cast@2"]],
    ["nolintNextLineParen", SRC, fill("NOLINTNEXTLINE(") + finding, ["nolint-form@1", "reinterpret-cast@2"]],
    // 理由の後ろに空白が続く NOLINT と、`:` が続く MSVC の理由の行
    ["nolintReasonBlanks", SRC, `int a = (int)x; // NOLINT(cpp-rules-C2.6): a${" ".repeat(2 * MiB)}\n`, ["nolint-form@1"]],
    ["pragmaReasonColons", SRC, `#if defined(_MSC_VER)\n#pragma warning(push)\n//${fill(": ")}\n#pragma warning(disable: 4774)\n#pragma warning(pop)\n#endif\n`, ["pragma-disable@4"]],
    // ' を含むヘッダは C17・C23・C++ の 3 つの読み方で読む
    ["headerQuote", "src/a.h", fill("x'a' atoi(s);\n"), null],
    // 公開ヘッダの大きなブロックコメント (§C1.6 の照合が空白の並びで 2 乗にならない)
    ["publicHeaderComment", PUB, `char c = 'a';\n/*${"x".repeat(2 * MiB)}*/\nbool parse(const uint8_t* data, size_t size);\n`, ["ptr-size-param@3"]],
  ];
  for (const [name, file, source, expected] of inputs) {
    const started = process.hrtime.bigint();
    const findings = scanSource(file, source);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1500, `${name}: ${ms.toFixed(0)} ms`);
    if (expected) assert.deepEqual(findings.map((f) => `${f.rule}@${f.line}`), expected, name);
    else assert.equal(findings.at(-1).rule, "finding-limit", name);
  }
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
