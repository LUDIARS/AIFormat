# AIFormat/cpp — C++ ツール設定の正本

LUDIARS の C++ リポ (Ergo / Pictor / Ludellus-Native / AdventureCube / KuzuSurvivors など) が使う
整形・静的解析・エディタ設定の **正本** を置く。規約本文の正本は
[`RULE_CODE_CPP.md`](../RULE_CODE_CPP.md)、このディレクトリの扱いは同 **§C9.3** が定める。
各リポにあるのは、ここから版を付けてコピーした同期コピーであり、リポ側で書き換えない。

## ファイル

| ファイル | 役割 | 主な規約 |
|---|---|---|
| `.clang-format` | 整形。Google ベースを Ergo の実態 (4 スペース・100 桁・ポインタ左寄せ) に寄せ、インクルード順を固定する | §C9.3 |
| `.clang-tidy` | 静的解析。有効にする check を `-*` から名前で列挙し、各 check の前に担保する `§Cn.m` を書く | §C1〜§C8 の担保、§C9.3 / §C9.4 |
| `.editorconfig` | エディタ既定値。UTF-8 (BOM なし)・LF・末尾改行、C++ / CMake / シェーダの字下げ | §C9.3 |
| `LudiarsCxxBaseline.cmake` | usage / warnings の 2 つの baseline target と configure 検査 | §C4.1〜§C4.4・§C4.7、§C1.7、§C2.6〜§C2.9、§C3.7、§C7.4 |
| `rules/cpp-rules.mjs` | 正規表現の規則表と公開 API・CLI。PostToolUse フックと `cpp-build-policy` gate が共有する | §C9.5 |
| `rules/lib/` | 規則表の実装 (字句処理・設定 `cpp-rules.json` の検証・実行・git diff の収集・CLI) | §C9.5 / §C9.6 |
| `rules/cpp-rules.test.mjs` | 規則表のテスト (`node --test cpp/rules/cpp-rules.test.mjs`)。各リポへは同期しない | §C9.5 |

## 固定版

clang-format と clang-tidy は **LLVM 19** に固定する。`.clang-tidy` で `(19+)` と書いた check / option は
18 以前に無く、古い版では黙って無効になる。版を下げて運用しない。版を上げるときは、この正本を
先に更新し、全 C++ リポの同期コピーを同じ版で揃える。

## baseline の使い方 (`LudiarsCxxBaseline.cmake`)

各リポは同期コピーを `cmake/LudiarsCxxBaseline.cmake` に置き、トップの `CMakeLists.txt` で include する
(§C4.2)。詳しい説明はファイル先頭のコメントにある。

```cmake
cmake_minimum_required(VERSION 3.24)                 # §C3.6
project(ergo LANGUAGES CXX)                          # CXX を有効にしてから include する
include(cmake/LudiarsCxxBaseline.cmake)

add_library(ergo_math STATIC ...)
target_link_libraries(ergo_math
  PUBLIC  ludiars_cxx_usage                          # §C4.2 (a) 必ず PUBLIC
  PRIVATE ludiars_cxx_warnings)                      # §C4.2 (b) 必ず PRIVATE
ludiars_cxx_mark_warnings_compliant(ergo_math)       # §C4.3 準拠 target 一覧 (ラチェット)
ludiars_cxx_mark_logic_layer(ergo_world)             # §C7.4 ロジック層 (cpp-rules.json の logicDirs と同じ範囲)
ludiars_cxx_enable_strict_warnings(ergo_net)         # §C2.6 境界層は必須
ludiars_cxx_check_targets(PREFIX ergo_ MODE WARNING) # §C4.2 / §C4.7。移行完了後は FATAL_ERROR
```

キャッシュ変数は **preset で指定し、target ごとに書かない**。

| 変数 | 値 (既定) | 規約 | 指定する preset |
|---|---|---|---|
| `LUDIARS_CXX_STANDARD` | `20` / `23` (`20`) | §C4.1 | 最上位のリポだけが決める。`verify-cxx23` では `23` |
| `LUDIARS_CXX_WARNINGS_AS_ERRORS` | `ON` / `OFF` (`OFF`) | §C4.3 | `verify` で `ON`。取り込むホストの既定は `OFF` |
| `LUDIARS_CXX_HARDENING` | `ON` / `OFF` (`OFF`) | §C2.8 / §C2.9 | debug・テスト・sanitizer の preset で `ON` |
| `LUDIARS_CXX_SANITIZE` | `OFF` / `asan-ubsan` / `tsan` (`OFF`) | §C3.7 | `asan-ubsan` / `tsan` |
| `LUDIARS_CXX_MSVC_CONFORMANCE` | `ON` / `OFF` (`OFF`) | §C4.2 | `/permissive-` と `/Zc:preprocessor` の opt-in |

関数:

- `ludiars_cxx_mark_warnings_compliant(<target>...)` — §C4.3 の「準拠 target 一覧」。`WARNINGS_AS_ERRORS` のとき全警告がエラーになる。
- `ludiars_cxx_mark_logic_layer(<target>...)` — §C7.4 のロジック層。fast-math 系のフラグがあれば `ludiars_cxx_check_targets` が FATAL_ERROR にする。
- `ludiars_cxx_check_targets(PREFIX <prefix> [MODE WARNING|FATAL_ERROR])` — トップで 1 回呼ぶ。`<prefix>` で始まる target の baseline リンク・標準・他リポ `src/` の include (§C4.1 / §C4.2 / §C4.7) を configure の最後に検査する。
- `ludiars_cxx_enable_strict_warnings(<target>)` — `-Wshadow -Wconversion -Wsign-conversion` (MSVC は `/w44242 /w44365`)。§C2.6 の境界層には必ず付ける。
- `ludiars_cxx_enable_sanitizers(<target> [THREAD] [UNSIGNED_INTEGER_OVERFLOW] [IMPLICIT_CONVERSION])` — §C3.7。境界層とその `fuzz_corpus` テストには `UNSIGNED_INTEGER_OVERFLOW` (§C2.7) と `IMPLICIT_CONVERSION` (§C2.6) を付ける (clang のみ。他は未実施を WARNING で出す)。
- `ludiars_cxx_enable_hardening(<target>)` — §C2.9 を特定の target だけに付ける。

`asan-ubsan` preset の test 環境には `ASAN_OPTIONS=detect_stack_use_after_return=1` を置く (§C3.7 / §C6.5)。

## 規則表の設定 (`cpp-rules.json`)

規則表 (`rules/cpp-rules.mjs`) は、リポのルートの `cpp-rules.json` を読む。無ければ既定値で動く。
未知のキーや型違いは例外で止まる (黙って既定値に戻さない)。

```json
{
  "prefix": "ERGO",
  "logicDirs": ["src/world/", "src/physics2d/"],
  "logger": { "files": ["src/log/log.cpp"] },
  "ioHelpers": ["src/io/path_utf8.cpp"],
  "ownershipHelpers": ["src/net/owned.h"],
  "publicIncludeAllow": [],
  "disable": { "C3.1": "Pictor は Ergo の下位なので Ergo の mini-gtest を取り込めない (循環依存)" }
}
```

| キー | 意味 | 有効になる規約 |
|---|---|---|
| `prefix` | マクロ prefix (英大文字) | §C6.7 の `<PREFIX>_ALLOW_GLOBAL` マーカー、§C4.6 の自リポ option、§C4.7 の自リポ判定、§C4.10 の対象マクロ。未設定なら §C4.10 は全マクロを、§C6.7 は任意の `<英大文字>_ALLOW_GLOBAL` を対象にする |
| `logicDirs` | ロジック層のディレクトリ (glob。末尾 `/` はディレクトリ)。baseline の `ludiars_cxx_mark_logic_layer` と同じ範囲を書く | §C7.2〜§C7.4。空なら無効 |
| `logger.files` | 共有ロガーの実装ファイル | §C8.4 を有効にし、そのファイルを除外する |
| `ioHelpers` | パス変換・`atomic_write_file` の helper (既定 `**/utf8_path.*` 等に追加) | §C2.13 / §C6.8 の除外 |
| `ownershipHelpers` | 所有権受け渡しの helper (既定 `**/ownership.*` 等に追加) | §C6.4 の除外 |
| `publicIncludeAllow` | 公開ヘッダで直接 include してよい SDK (例: Pictor の `vulkan`) | §C8.5 の許可リスト |
| `disable` | §C 番号か規則名 → 理由 (理由は必須) | §C9.5。`suppressible: false` の規則 (§C1.7・§C1.8 の `load-library`・§C2.1・§C2.2・§C6.7・§C9.4) は無効にできず、書くと例外になる |

§C2.6 の境界層は規則表ではなく CMake の target で宣言する (`ludiars_cxx_enable_strict_warnings` を付けた target)。

## 各リポへの同期

1. リポのルートへ `.clang-format` / `.clang-tidy` / `.editorconfig` をコピーし、1 行目に
   `# synced-from AIFormat/cpp@<commit>` (同期元の AIFormat のコミット) を書く。
2. プレースホルダを置き換える。`@REPO@` は自リポの include prefix (例: `ergo`)、
   `@REPO_UPPER@` はマクロ prefix (例: `ERGO`)。include prefix を持たないリポ
   (例: Ludellus-Native) も `@REPO@` を置き換える。prefix の無い `"..."` は自リポ扱いになる。
3. `third_party/` に `DisableFormat: true` と `SortIncludes: Never` だけの `.clang-format` を置く。
4. `LudiarsCxxBaseline.cmake` を `cmake/` へコピーし、1 行目に同じ `# synced-from` 行を書く (置換は無い)。
5. `rules/` を **`cpp-rules.test.mjs` を除いて** ディレクトリごと `tools/cpp-rules/` へコピーする
   (`cpp-rules.mjs` と `lib/`)。`.mjs` は 1 行目が shebang なので、`synced-from` 行は
   `tools/cpp-rules/SYNCED_FROM` に 1 行で書く。中身は書き換えない。

```sh
c=$(git -C ../AIFormat rev-parse --short HEAD)
for f in .clang-format .clang-tidy .editorconfig; do
  { echo "# synced-from AIFormat/cpp@$c"
    sed -e 's/@REPO_UPPER@/ERGO/g' -e 's/@REPO@/ergo/g' "../AIFormat/cpp/$f"; } > "$f"
done
mkdir -p cmake tools/cpp-rules/lib
{ echo "# synced-from AIFormat/cpp@$c"; cat ../AIFormat/cpp/LudiarsCxxBaseline.cmake; } > cmake/LudiarsCxxBaseline.cmake
cp ../AIFormat/cpp/rules/cpp-rules.mjs tools/cpp-rules/
cp ../AIFormat/cpp/rules/lib/*.mjs tools/cpp-rules/lib/
echo "synced-from AIFormat/cpp@$c" > tools/cpp-rules/SYNCED_FROM
```

`cpp-build-policy` の登録テストは `node tools/cpp-rules/cpp-rules.mjs . --base <merge-base>` を実行する (§C3.4)。

- リポ側の上書きは **末尾への追記だけ** とする。`.clang-format` と `.clang-tidy` のトップレベルは
  キーの重複がエラーになるので、正本に無いキーだけを足せる。`.clang-tidy` の `CheckOptions` は
  ファイル末尾のリストなので、同じ key を追記すると後勝ちで上書きになる (共通マクロ表が違うリポの
  `cppcoreguidelines-macro-usage.AllowedRegexp` など)。それ以外を変えたいときは正本へ PR を出す。
- 正本を更新したら、各リポで同期し直す PR を出す。`synced-from` の行で、どの版のコピーかを判定する。

## 検証

```sh
clang-format --style=file:cpp/.clang-format --dump-config > /dev/null
clang-tidy --config-file=cpp/.clang-tidy --verify-config
node --test cpp/rules/cpp-rules.test.mjs
```

合格条件: LLVM 19 の clang-tidy で `--verify-config` が `No config errors detected.` だけを出すこと。
18 では `(19+)` の check が unknown と出るのは想定どおり (版を下げて運用しない)。

リポでの検査は Revisor 登録テスト `cpp-format` / `cpp-tidy` (§C3.4) が、merge-base からの変更範囲
だけに掛ける (§C9.6)。整形は `git clang-format --diff <merge-base>` の出力で、clang-tidy は
clang-tidy-diff で変更行に限って判定する。
