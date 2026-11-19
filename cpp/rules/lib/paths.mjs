/** RULE_CODE_CPP §C9.5 規則表: パスの分類と言語判定。パスはリポ相対・区切りは `/`。 */

import {
  isCLanguageUnit, isModuleUnit, isNativeFragment, isNativeHeader, isNativeSource, isTranslationUnit,
} from "./languages.mjs";

/**
 * C/C++ のパス分類。拡張子の表は Revisor の同期コピー (languages.mjs) を正とし、ここでは書き写さない
 * (`.c++` `.h++` `.tcc` `.ccm` `.cxxm` `.c++m` `.m` `.M` `.C` なども Praesidium と同じに分類される)。
 * 小文字の `.m` は中身も見る: C 系の印が無いもの (MATLAB など) は engine が読まない (native-objc-probe.mjs)。
 * `.inc` / `.def` の断片は他言語とも共有する拡張子なので、Praesidium と同じく単独では検査しない。
 * 規則の `files` / `exclude` は `test(path)` を持てばよい (RegExp と同じ使い方)。
 */
const fileClass = (predicate) => Object.freeze({ test: (file) => predicate(String(file)) });
const isPolicyNative = (file) => isNativeSource(file) && !isNativeFragment(file);
const INCLUDE_DIR = /(?:^|\/)include\//;

/** 規則の `files` に使うパス分類。パスはリポ相対・区切りは `/`。 */
export const PATHS = Object.freeze({
  /** C と C++ のソースとヘッダ (C にも当てはまる規則: 禁止 API・実行時ロード・抑制の形式)。 */
  native: fileClass(isPolicyNative),
  /** C++ のソースとヘッダ (Objective-C++・モジュール単位・C と C++ のどちらにもなる .C / .M を含む。.c と .m は含まない)。 */
  cpp: fileClass((file) => isPolicyNative(file) && !isCLanguageUnit(file)),
  /** 翻訳単位になるソース。 */
  source: fileClass(isTranslationUnit),
  /** ヘッダ。 */
  header: fileClass(isNativeHeader),
  /** 公開ヘッダ (`include/` 配下)。 */
  publicHeader: fileClass((file) => INCLUDE_DIR.test(file) && isNativeHeader(file)),
  /** C++20 モジュールのインターフェース単位。 */
  moduleUnit: fileClass(isModuleUnit),
  /** CMake。 */
  cmake: /(?:^|\/)CMakeLists\.txt$|\.cmake$/i,
  /** シェーダ。 */
  shader: /\.(?:glsl|comp|vert|frag|geom|tesc|tese|mesh|task|rgen|rchit|rmiss|rahit|rint|rcall)$/i,
  /** tests/ 配下の翻訳単位。 */
  testSource: fileClass((file) => TESTS_DIR.test(file) && isTranslationUnit(file)),
  /** Augur の契約登録ファイル。 */
  augurContracts: /(?:^|\/)augur\.contracts\.json$/,
});

/** どの規則も見ないパス。third_party は §C4.8 の同梱条件だけ (別の検査) を適用する。 */
export const GLOBAL_EXCLUDE =
  /(?:^|\/)(?:third_party|3rdparty|external|extern|vendor|node_modules|\.git)\/|^(?:[^/]+\/)?(?:build|out|cmake-build-[^/]+)\//i;
export const BASELINE_CMAKE = /(?:^|\/)LudiarsCxxBaseline\.cmake$/;
/** §C4.5 file-glob の除外: baseline と、tests/ 配下の `cmake -P` 用スクリプト (*.cmake)。 */
export const CMAKE_SCRIPT_OR_BASELINE = /(?:^|\/)LudiarsCxxBaseline\.cmake$|(?:^|\/)tests?\/(?:.*\/)?[^/]+\.cmake$/i;
export const TESTS_DIR = /(?:^|\/)tests?\//;
/** §C8.4: 直接出力を許す場所 (CLI・demo・tools・tests の main)。 */
export const OUTPUT_EXEMPT_DIRS = /(?:^|\/)(?:tests?|demos?|examples?|tools|cli|fuzz|bench|benchmarks?)\//;
/** §C4.9: OS ごとに分割済みのファイル。 */
export const PLATFORM_SPLIT_FILE = /_(?:win|win32|windows|posix|unix|linux|android|apple|mac|macos|ios|darwin)\.[^/.]+$/i;
export const OS_MACRO = String.raw`(?:_WIN32|_WIN64|__APPLE__|__ANDROID__|__linux__|__linux|__unix__|__unix|__MACH__|__EMSCRIPTEN__|WINAPI_FAMILY|TARGET_OS_\w+)`;

/** ファイルの言語。規則表の対象外なら null。 */
export function languageOf(file) {
  if (PATHS.cmake.test(file)) return "cmake";
  if (PATHS.native.test(file)) return "cpp";
  if (PATHS.shader.test(file)) return "shader";
  if (PATHS.augurContracts.test(file)) return "json";
  return null;
}

export function normalizePath(file) {
  return String(file).replace(/\\/g, "/").replace(/^\.\//, "");
}
