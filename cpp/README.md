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
| `rules/lib/` | 規則表の実装 (字句処理・設定 `cpp-rules.json` の検証・実行・git diff の収集・CLI)。C/C++ の字句処理と拡張子表は Revisor の同期コピー (下の「Revisor からの同期」) | §C9.5 / §C9.6 |
| `rules/cpp-rules.test.mjs` | 規則表のテスト (`node --test cpp/rules/cpp-rules.test.mjs`)。各リポへは同期しない | §C9.5 |
| `LudiarsCxxBaseline.test.mjs` | baseline のテスト。小さな CMake プロジェクトを g++ / clang++ で configure し、警告・エラー化・hardening が付く target を compile_commands.json で確かめる (cmake が無ければ skip)。各リポへは同期しない | §C2.9 / §C4.3 / §C4.10 |

## 固定版

clang-format と clang-tidy は **LLVM 19** に固定する。`.clang-tidy` で `(19+)` と書いた check / option は
18 以前に無く、古い版では黙って無効になる。版を下げて運用しない。版を上げるときは、この正本を
先に更新し、全 C++ リポの同期コピーを同じ版で揃える。

## baseline の使い方 (`LudiarsCxxBaseline.cmake`)

各リポは同期コピーを `cmake/LudiarsCxxBaseline.cmake` に置き、トップの `CMakeLists.txt` で `project()` の直後、
`add_subdirectory` と target の定義より前に include する (§C4.2)。詳しい説明はファイル先頭のコメントにある。
`LUDIARS_CXX_HARDENING=ON` の hardening (§C2.8 / §C2.9) は、`ludiars_cxx_usage` (INTERFACE) と、baseline を include した
ディレクトリ以下 (`add_compile_definitions` / `add_compile_options`) に付く。include より前に追加したサブディレクトリと作った target には
(usage をリンクしていなければ) 付かないか一部しか付かず、同じ実行ファイルに付いた TU と付いていない TU が混ざる (§C4.10)。

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
| `LUDIARS_CXX_HARDENING` | `ON` / `OFF` (`OFF`) | §C2.8 / §C2.9 | debug・テスト・sanitizer の preset で `ON`。ビルドの全 target に同じ値で付き、target ごとには付けない (§C4.10) |
| `LUDIARS_CXX_SANITIZE` | `OFF` / `asan-ubsan` / `tsan` (`OFF`) | §C3.7 | `asan-ubsan` / `tsan` |
| `LUDIARS_CXX_MSVC_CONFORMANCE` | `ON` / `OFF` (`OFF`) | §C4.2 | `/permissive-` と `/Zc:preprocessor` の opt-in |

関数:

- `ludiars_cxx_mark_warnings_compliant(<target>...)` — §C4.3 の「準拠 target 一覧」。`WARNINGS_AS_ERRORS` のとき全警告がエラーになる。非推奨 (`-Wdeprecated-declarations` / C4996) のエラー化も、この一覧の target にだけ付く (ラチェット)。
- `ludiars_cxx_mark_logic_layer(<target>...)` — §C7.4 のロジック層。fast-math 系のフラグがあれば `ludiars_cxx_check_targets` が FATAL_ERROR にする。
- `ludiars_cxx_check_targets(PREFIX <prefix> [MODE WARNING|FATAL_ERROR])` — トップで 1 回呼ぶ。`<prefix>` で始まる target の baseline リンク・標準・他リポ `src/` の include (§C4.1 / §C4.2 / §C4.7) を configure の最後に検査する。
- `ludiars_cxx_enable_strict_warnings(<target>)` — `-Wshadow -Wconversion -Wsign-conversion` (MSVC は `/w44242 /w44365`)。§C2.6 の境界層には必ず付ける。
- `ludiars_cxx_enable_sanitizers(<target> [THREAD] [UNSIGNED_INTEGER_OVERFLOW] [IMPLICIT_CONVERSION])` — §C3.7。境界層とその `fuzz_corpus` テストには `UNSIGNED_INTEGER_OVERFLOW` (§C2.7) と `IMPLICIT_CONVERSION` (§C2.6) を付ける (clang のみ。他は未実施を WARNING で出す)。

`asan-ubsan` preset の test 環境には `ASAN_OPTIONS=detect_stack_use_after_return=1` を置く (§C3.7 / §C6.5)。

clang / gcc の `ludiars_cxx_warnings` は、Praesidium の警告パスが有効にする警告 (Revisor `src/praesidium/native-baseline.mjs` の
`NATIVE_WARNINGS`: `-Wall -Wextra -Wformat=2 -Wvla -Wnull-dereference`) をすべて含む (§C4.3)。Revisor 側の一覧が変わったら、baseline も合わせる。

### 配布ビルドのハードニング (Lorica)

`LUDIARS_CXX_HARDENING` は debug・テスト・sanitizer の preset 用で、配布するビルドのコンパイラ・リンカのハードニング
(`_FORTIFY_SOURCE`、stack protector、CFI / CET、PIE / RELRO、`/guard:cf`) は baseline に持たない。release の preset では Lorica (`LUDIARS/Lorica`) を使う (§C2.9)。

- `find_package(Lorica 0.1 CONFIG REQUIRED)` で取り込み、同じ実行ファイル・共有ライブラリにリンクする、ソースからビルドする全 target に
  `lorica_harden_target(<target> EXTENDED)` を付ける (§C4.10)。release の preset だけで ON にする option (§C4.6 の `<PREFIX>_ENABLE_*`) で切り替える。
  `find_package(Lorica)` は最上位の `CMakeLists.txt` のディレクトリスコープで、`add_subdirectory` より前に呼ぶ
  (MSVC 19.52+ で `cxx_std_23` を ISO の `/std:c++23` にする Lorica の切り替えは、呼んだディレクトリ以下にだけ効く。§C4.1)。
- `CMakeLists.txt` を変えずに付けるときは、preset で `CMAKE_PROJECT_TOP_LEVEL_INCLUDES` に Lorica の `cmake/LoricaInject.cmake`、
  `LORICA_TARGETS` に対象の全 target、`LORICA_PROFILE` に `extended` を渡す。
- release の preset では `CMAKE_BUILD_TYPE` (単一構成のジェネレータ) を指定する。空だと FORTIFY が付かず、`EXTENDED` もそれを拒まない。
- 基本 profile (`EXTENDED` なし) は、Linux では stack protector・PIE・RELRO / NX に加えて、標準ライブラリの hardening マクロ (libstdc++ の assertions、
  libc++ の FAST)・最適化構成の FORTIFY・stack clash と CET / BTI を、使える範囲で付ける (使えないものは警告を出して外す)。
  `EXTENDED` は libstdc++ の assertions か libc++ の EXTENSIVE、最適化構成すべてで実効の FORTIFY 3、stack clash と CET / BTI の両方、
  `-ftrivial-auto-var-init=zero` を求め、MSVC では `_MSVC_STL_HARDENING`・`_MSVC_STL_DESTRUCTOR_TOMBSTONES`・`/CETCOMPAT` を求める。どれかが欠ければ configure が失敗する (§C2.9)。
- Lorica が対応するのは Windows (MSVC 互換) と Linux (GCC / Clang) で、`EXTENDED` は Linux の GCC 12+ / Clang 18+ (x86-64 / AArch64) と
  MSVC 19.44+ (x64) だけ。それ以外 (Apple clang、Android NDK など) では configure が失敗するので、それらの release preset では ON にしない。
- Lorica の profile は、基本 profile も `EXTENDED` も `LUDIARS_CXX_HARDENING` と同じ preset では使わない。Lorica は標準ライブラリの hardening マクロを
  target ごとに付けて前の定義を置き換える (Linux では基本 profile も) ので、baseline がビルド全体に付けた値が Lorica を付けた target でだけ変わる (§C4.10)。
  未初期化の自動変数も、baseline は `-ftrivial-auto-var-init=pattern`、`EXTENDED` は `=zero` にする。
- `lorica_deprecate_unsafe_apis(<target>)` は、その target の非推奨をすべてエラーにするので、準拠 target にだけ付ける (§C4.3)。
- 付けるものと限界は Lorica の `README.md` と `spec/feature/security-contracts.md` (SPEC-LR-EXTENDED / SPEC-LR-UNSAFE-API / SPEC-LR-CXX23) を正とする。

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

抑制注釈 (`NOLINT` / `NOLINTNEXTLINE` / `NOLINTBEGIN`・`NOLINTEND`) と MSVC の `#pragma warning(push)` / `(pop)` の範囲は、ファイルごとに 1 回の走査で
求める。注釈の取り出し (閉じの `)` を前へ 1 回だけ探す) と理由の形式の検査も後戻りしないので、どれも入力の長さに比例する時間で済む
(閉じない `NOLINT(` が並ぶ 2 MiB の行、空白や `:` が続く理由の行で 0.1〜0.3 秒)。注釈の check 名の glob (`cppcoreguidelines-*` など) も
正規表現にせず、最後の `*` にだけ戻る照合で長さに比例する時間で照合する (`*` を並べても止まらない)。
C と C++ の 3 つの読み方で読むヘッダも、2 MiB で 1 秒前後に収まる (字句処理が 1 回 0.2〜0.3 秒。C++ の規則は C++ の読み方でだけ照合し、正規表現の規則は
1 つの規則の finding が上限 (200 件) を超えた読み方はそれ以上の一致を読まない)。テストは、並行して走るテストで遅れても落ちないよう
6 秒未満を確かめる (2 乗の時間なら 512 KiB でも 10 秒を超える)。
次の規則は、細工した入力では長さの 2 乗の時間になりうる (この PR より前からの性質):
括弧の対応を読む規則 (§C1.1 のテンプレート、§C2.6 の関数形式キャスト、§C8.3 の初期化子など。閉じない括弧が大量に並ぶ入力)、
§C1.7 の `import` / `module` の行 (後ろに空白が大量に続く入力)、§C2.4 の構造体レイアウト (`sizeof` が大量に並ぶ入力)、§C6.7 の静的変数の宣言。
このため hook (Castra の `cpp-convention-check`) は規則表を時間予算付きの worker で回し、予算を超えたらそう注記する。

## Revisor からの同期

規則表は C/C++ を Revisor の Praesidium と同じ境界で読む。字句処理と拡張子表は自作せず、Revisor の次のファイルの同期コピーを使う。

| コピー | 同期元 | 使い道 |
|---|---|---|
| `rules/lib/native-lexer.mjs` | `Revisor/src/praesidium/native-lexer.mjs` | C/C++ のコメントとリテラルの空白化 (raw 文字列・桁区切り・header-name・行継続・ダイグラフを clang と同じ境界で読む)。規則表が読むビュー (コード・論理行・NOLINT を読むコメント入りのビュー) は `native-mask.mjs` がこの出力から作る。自前の字句処理を持つ `mask.mjs` が読むのは CMake とシェーダだけ |
| `rules/lib/languages.mjs` | `Revisor/src/praesidium/languages.mjs` | C/C++ の拡張子表 (`.c++` `.h++` `.tcc` `.ccm` `.cxxm` `.c++m` `.m` なども含む)。`paths.mjs` の分類はこの表から作る |

- 1 行目に `// synced-from: LUDIARS/Revisor src/praesidium/<ファイル名> @ <commit>` (例: `// synced-from: LUDIARS/Revisor src/praesidium/languages.mjs @ b2c86e9`) を書き、
  それ以外は書き換えない。この綴りは `cpp-rules.test.mjs` が検査する。直したいときは Revisor へ PR を出す。
- C と C++ のどちらにもなるファイル (ヘッダ・`.C`・`.M`) は、Praesidium と同じく C17・C23・C++ の読み方で読む。全部の読み方で照合するのは
  C にも当てはまる規則 (`files` が `PATHS.native`: §C1.8・§C2.1・§C9.4) だけで、ほかの C++ の規則は C++ の読み方だけで照合する
  (`lib/engine.mjs` の `contextsFor`)。C の読み方は C++ の raw 文字列の中身をコードとして読むので、ヘッダの raw 文字列に書いた
  禁止 API の呼び出しや抑制 pragma は報告される (Praesidium の字句規則と同じ。RULE_CODE_CPP §C9.5)。
  同じ理由で、C の読み方では raw 文字列の中の `// NOLINT` もコメントとして読まれ (§C9.4 の nolint-form)、C++ の桁区切り (`1'000`) や
  raw 文字列の閉じ `)"` の後ろは行末までリテラルになるので、その行の後ろに書いた NOLINT は C の読み方では見えない
  (抑制できる §C1.8 の `loader-outside` は、全部の読み方で抑制されていないと報告される)。NOLINT は桁区切りや raw 文字列の無い行に書く。
- 小文字の `.m` は、Praesidium (files.mjs の trackedSources) と同じく C 系の印 (指令・`{`・`@import` など) が無ければ MATLAB などの
  ファイルとして読まない。判定は `rules/lib/native-objc-probe.mjs` (`Revisor/src/praesidium/files.mjs` の `mayHoldObjectiveC` の同期コピー)。
  praesidium.json に単位として載せた `.m` は印が無くても Praesidium が読むが、規則表は praesidium.json を読まないので読まない。
- Revisor 側が変わったらコピーし直し、`node --test cpp/rules/cpp-rules.test.mjs` を回す。各リポへは下の手順 5 で `lib/` ごと届く。

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
node --test cpp/LudiarsCxxBaseline.test.mjs
```

合格条件: LLVM 19 の clang-tidy で `--verify-config` が `No config errors detected.` だけを出すこと。
18 では `(19+)` の check が unknown と出るのは想定どおり (版を下げて運用しない)。

リポでの検査は Revisor 登録テスト `cpp-format` / `cpp-tidy` (§C3.4) が、merge-base からの変更範囲
だけに掛ける (§C9.6)。コマンドの正は RULE_CODE_CPP §C9.3。

```sh
base=$(git merge-base origin/main HEAD)
git add -N <新しいファイル>   # git clang-format と git diff は未追跡のファイルを見ない
# 整形: 出力が空なら pass (-q が無いと整形済みでも 1 行の報告が出る)
git clang-format --diff -q --extensions c,cc,cpp,cxx,c++,cppm,ixx,mpp,ccm,cxxm,c++m,m,mm,h,hh,hpp,hxx,h++,inl,ipp,tpp,tcc "$base"
# clang-tidy: LLVM 19。リポの .clang-tidy と verify preset の compile_commands.json で変更行だけを見て、終了コードで判定する
git diff -U0 "$base" | clang-tidy-diff -p1 -path <verify preset のビルドディレクトリ> -quiet
```

`--extensions` を省くと、git clang-format の既定の一覧にある `json` などにも正本の `.clang-format` (`Language:` を持たず全言語に効く) が掛かり、
`praesidium.json` の登録 (§C2.10) が整形の差分になって落ちる。正本に `Language: Json` と `DisableFormat: true` の節を足す方法は採らない:
既定の一覧には `js`・`ts`・`java`・`proto`・`cs`・Verilog もあって JSON だけでは足りず、2 つ目の YAML 文書を末尾に置くと、リポ側の
「末尾への追記」(上の「各リポへの同期」) がその節に入ってしまうため。シェーダは既定の一覧に無く、clang-format に GLSL の読み方も無いので対象にしない。
