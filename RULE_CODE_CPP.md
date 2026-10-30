# C++ コード規約 (C++ Code Conventions)

LUDIARS の C++ リポジトリで **C++ のコードとビルド定義を書くときの規約**。

C++ は、コンパイルが通っても未定義動作・ODR 違反・プラットフォーム差が残る言語である。
本書は、それを記憶ではなく **型・ビルド設定・ゲート** で縛ることを目的とする。
柱は 3 本の既決事項 (Concept で契約を型にする / Revisor Praesidium の脆弱性検査を書く側へ
前倒しする / テストで境界と決定性を固定する) と、それを機械担保するための 6 本 (ビルド基盤、
失敗の型、所有権と寿命、リアルタイムと決定性、API の形、運用) からなる。

- **適用対象**: LUDIARS の C++ リポ (Ergo / Pictor / Ludellus-Native / AdventureCube /
  KuzuSurvivors 等) の C/C++ ソースとヘッダ、`CMakeLists.txt` / `*.cmake` /
  `CMakePresets.json`、シェーダ (`shaders/*`)。`third_party/` 配下は §C4.8 の同梱条件だけを適用する。
- **関連規約**: 全言語共通 [`RULE_CODE.md`](./RULE_CODE.md) / テスト [`RULE_TEST.md`](./RULE_TEST.md) /
  技術スタック [`RULE_TECH_STACK.md`](./RULE_TECH_STACK.md) / 入口 [`HARNESS.md`](./HARNESS.md) /
  レビュー [`common/REVIEW_CODE_QUALITY.md`](./common/REVIEW_CODE_QUALITY.md)・
  [`common/REVIEW_VULNERABILITY.md`](./common/REVIEW_VULNERABILITY.md)・
  [`local-app/REVIEW_VULNERABILITY_LOCAL.md`](./local-app/REVIEW_VULNERABILITY_LOCAL.md)・
  [`common/REVIEW_DESIGN.md`](./common/REVIEW_DESIGN.md)・[`common/REVIEW_QUALITY.md`](./common/REVIEW_QUALITY.md) /
  ツール設定 [`cpp/README.md`](./cpp/README.md)。
- **RULE_CODE.md 第 II 部の全規約は C++ にも適用する。本書は C++ 固有の追加・具体化だけを書く。**
  同じ内容を二重に定義しない。C++ について本書と RULE_CODE が食い違う箇所は本書を優先する
  (例: MSVC の `/utf-8` は RULE_CODE §17 から本書 §C4.2 を参照する)。

この文書が C++ 規約の **正本**。ツール設定の正本は [`cpp/`](./cpp/)、スキルと harness は
ここを参照・同期する (末尾「運用」)。

## 読み方

- **ID**: `§C<柱>.<番号>` は安定参照 ID。番号は変えず、欠番を再利用しない。廃止した規約は
  「§Cn.m 欠番 (廃止理由)」の行で残す。新しい規約は各柱の末尾に新番号で足す。
- **必須 / 推奨**: 規約はすべて必須で、見出しに「— 必須」と書く。規約の中の推奨事項は「(推奨)」で始まる独立した箇条に書き、
  ゲートで落とさずレビューで指摘する。
- **各規約の欄**: 規約文 → **根拠** (実リポの証拠パス) → **担保** `[memory|hook|gate — 手段]` →
  **関係** (具体化元の RULE_CODE §N / RULE_TEST §N。無いものは「新規」)。
- **「新規・変更する」**: merge-base からの変更範囲 (変更行・変更 TU・変更ヘッダを include する TU) を
  指す (§C9.6)。既存コードへの遡及は「既存コードへの適用方針」に従う。
- **用語**:
  - **規則表** = [`cpp/rules/cpp-rules.mjs`](./cpp/rules/cpp-rules.mjs)。hook と `cpp-build-policy` gate が同じ表を使う (§C9.5)。
    担保欄に書いた正規表現は要約であり、検出範囲は規則表を正とする。
  - **自リポの target** = そのリポの prefix (`ergo_` 等) を持つ CMake target。
  - **外部由来** = 信頼境界の外から来た値: ネットワーク、ファイル (セーブ・設定・アセット)、HTTP、IPC、
    環境変数、実行時ロードしたライブラリの戻り値。
  - **ロジック層** = リプレイやサーバ照合の対象として、リポが設計宣言 (RULE_CODE I-3) に列挙し、規則表の設定 `cpp-rules.json` の
    `logicDirs` (ディレクトリ。§C7.2〜§C7.4 の規則表) と baseline の `ludiars_cxx_mark_logic_layer(<target>)` (target。§C7.4 の configure 検査) の
    両方に同じ範囲を宣言したもの。片方だけでは、もう片方の検査が効かない (書き方は `cpp/README.md`)。
  - **境界層** = 外部由来のバイト列をデコード・エンコードする target (シリアライズ層・ネットワーク層)。リポが設計宣言に列挙し、
    baseline の `ludiars_cxx_enable_strict_warnings(<target>)` を付けて宣言する (§C2.6 / §C2.7)。
  - **GPU target** = Vulkan をリンクするか、`<PREFIX>_WITH_VULKAN` などの GPU option で有効になる target。
  - **baseline** = [`cpp/LudiarsCxxBaseline.cmake`](./cpp/LudiarsCxxBaseline.cmake) が定義する
    INTERFACE target `ludiars_cxx_usage` と `ludiars_cxx_warnings`。

## 柱の一覧

| 柱 | 内容 | 由来 |
|----|------|------|
| **C1** | Concept と型による契約 | ユーザ既決 |
| **C2** | Revisor Praesidium の脆弱性対応を書く側へ取り込む | ユーザ既決 |
| **C3** | テスト | ユーザ既決 |
| **C4** | ビルド基盤・ツールチェイン (C1〜C3 を機械担保する前提) | 追加 |
| **C5** | 失敗の型と例外の境界 | 追加 |
| **C6** | 所有権・寿命・並行・永続化 | 追加 |
| **C7** | リアルタイム処理と決定性 (ゲーム固有) | 追加 |
| **C8** | API の形・命名・依存の衛生 | 追加 |
| **C9** | 機械担保と運用 | 追加 |

---

## C1. Concept と型による契約

- **§C1.1 制約のないテンプレート引数の禁止 — 必須**: 新規・変更する関数テンプレートのうち、次の 3 種類は制約を必須とする。
  値として保持・ムーブ・破棄するだけの型引数は対象外。
  - (1) 引数を呼び出すもの → `std::invocable` などで制約する。
  - (2) `Args&&...` を転送して T を構築するもの → `std::constructible_from<T, Args...>` で制約する。
  - (3) 演算子やメンバを使うもの → 名前付き concept で制約する。
  - 根拠: `Ergo/include/ergo/physics2d/world.h:58` の for_each_body は契約がコメントにしかない。`math/pool.h:101,139` の create は無制約。手本は `math/mat.h:28` の `Scalar T`。
  - 担保: [hook + gate — 規則表が、追加行で制約の無い呼び出し型の引数 (`Fn` / `F` / `Func` / `Function` / `Callback` / `Visitor` / `Pred` / `Handler` / `Callable` など) と `Args&&...` を検出する。concept 定義とテンプレートテンプレート引数は除外。正確なパターンは規則表を正とする]
  - 関係: RULE_CODE §8 の C++ 具体化
- **§C1.2 SFINAE の禁止 — 必須**: 新規・変更する宣言では、オーバーロード選択に `std::enable_if`、`void_t` による検出、
  戻り値型 `decltype` による SFINAE を使わない。requires 節、標準 concept、`if constexpr (Concept<T>)` を使う。
  SFINAE が目的でない decltype / declval は対象外。
  - 根拠: `Ergo/include/ergo/blackboard/property.h:23-28` の自作 `has_eq` は `std::equality_comparable` で置き換えられる。
  - 担保: [hook + gate — 規則表の `enable_if|void_t`。gate — clang-tidy `modernize-use-constraints`。Praesidium の tripwire にはスタイル規則を混ぜない]
  - 関係: 新規
- **§C1.3 条件付きメンバは宣言側で制約する — 必須**: テンプレート引数によって使えるかが変わるメンバは、宣言側の requires 節
  (`requires (N >= 3)`) で制約する。本体の `if constexpr` で return を省くこと、本体の `static_assert` で可否を判定することは禁止。
  非型テンプレート引数の値域も requires 節に書く。
  - 根拠: `Ergo/include/ergo/math/vec.h:34-44` では `Vec<2,float>::z()` がコンパイルを通り、return のない UB になる。`mat.h:44` の identity() は requires 式で可否を判定できない。
  - 担保: [gate — 自リポの target で `-Wreturn-type` (MSVC C4715)。エラー化 (`-Werror=return-type` / `/we4715`) は §C4.3 の `LUDIARS_CXX_WARNINGS_AS_ERRORS` に従う。§C3.5 の否定 static_assert]
  - 関係: 新規
- **§C1.4 concept の置き場所と命名 — 必須**: 標準の `<concepts>` / `<iterator>` / `<ranges>` で表せる制約は自作しない。
  ドメイン concept の定義 (`concept X =`) は各モジュールの公開ヘッダ直下の `concepts.h` にだけ書く。
  複数モジュールで共有する concept は下層の共通モジュール (Ergo なら ergo_common) に置く。
  - 根拠: Ergo の CLAUDE.md は `ergo_<domain>` 同士の cross-import を禁止している。Ludellus-Native は C++20 なのに concept が 0 件。
  - 担保: [hook + gate — 規則表が `concepts.h` 以外に追加された `concept\s+\w+\s*=` を検出。Anatomia の membership とレイヤ検証]
  - 関係: RULE_CODE §3・§4 の具体化
- **§C1.5 静的多態と動的多態の使い分け — 必須**: **concept を既定とし、virtual の `I<Name>` (または C ABI) は次の境界に限る。**
  concept テンプレートを次の境界の型として公開しない。
  - (1) 実行時にロードする共有ライブラリとの境界 (§C1.8) / (2) DLL・so の export /
    (3) 型の集合が開いている (他モジュールやホストが後から型を足す) 異種コンテナ。型の集合が閉じている (同じヘッダで列挙できる) 場合は
    `std::variant` を使う (§C2.5) / (4) 起動時に選ぶバックエンド。
  - 同じ契約を `I<Name>` と concept の両方で独立に定義しない。
  - `I<Name>` は public virtual デストラクタを持ち、非 static データメンバを持たず、コピーを禁止する。
  - `ERGO_HOT` (§C7.1) を付けた関数の中のループ本体では、virtual 呼び出しと、std::function・関数ポインタ経由の間接呼び出しを禁止する
    (ループの外で 1 回だけ解決して、テンプレート引数か concept で受ける)。
  - 判定表 (上の行から順に、最初に当てはまる行を選ぶ):

    | 条件 | 選ぶもの |
    |------|---------|
    | (1) 実行時ロードする共有ライブラリとの境界 / (2) DLL・so の export | `I<Name>` または C ABI (`extern "C"` の関数表) |
    | (4) 起動時に選ぶバックエンド | `I<Name>` |
    | (3) 型の集合が開いている異種コンテナ | `I<Name>` |
    | 型の集合が閉じている異種コンテナ | `std::variant` (§C2.5) |
    | それ以外 (同じビルドの中のジェネリックな処理) | concept で制約したテンプレート |

  - 根拠: virtual を既定にすると柱 C1 と衝突し、concept をそのまま境界に出すと ABI が壊れるので、判定できる境界条件で線を引く。
    `ERGO_PLUGIN_DIR` は tools/ergo (TypeScript) のローダで C++ の境界ではない (`Ergo/spec/setup/config-reference.md:11`)。
  - 担保: [hook + gate — 規則表が `class I[A-Z]\w*` 本体の非 static データメンバを検出。gate — clang-tidy `cppcoreguidelines-virtual-class-destructor`・`cppcoreguidelines-special-member-functions`、`-Wnon-virtual-dtor` (エラー化は §C4.3)。memory — 上の判定表を cpp-conventions と REVIEW_DESIGN の C++ 項目で確かめる。ERGO_HOT 内のループの間接呼び出しはレビュー]
  - 関係: Ergo CLAUDE.md の SOLID-D / I の具体化
- **§C1.6 読み取り専用の引数はビュー型で受ける — 必須**: 新規・変更する API では、所有しない読み取り専用の引数を
  `std::string_view` / `std::span<const T>` / `std::span<const std::byte>` で受ける。`(const T* data, size_t size)` の 2 引数と
  `const std::vector<T>&` は使わない。null 終端を要求する C API に直接渡す引数だけ `const std::string&` / `const char*` を許す。
  ビュー型の寿命は §C6.5。
  - 根拠: `Ergo/include/ergo/gpu_particle/gpu_backend.h:77`、`Ludellus-Native/native/src/world/proto/datagram.h:37`、`line_framer.cpp:5` などネットワークの入口に (ptr,size) が 26 箇所。Ludellus-Native の span は 0 件。
  - 担保: [hook + gate — 規則表が公開ヘッダ追加行の `\(\s*const\s+[\w:]+\s*\*\s*\w+\s*,\s*(std::)?size_t` と `const\s+std::vector<` 引数を検出。`modernize-avoid-c-arrays` と `pro-bounds-*` は担保にしない]
  - 関係: REVIEW_VULNERABILITY (境界外アクセス) の具体化
- **§C1.7 言語・ライブラリ機能の採否表 — 必須**: 次の表で「不採用」の機能は新規に導入しない。C++23 の機能は、
  4 つの toolchain (MSVC / Apple clang / Android NDK / Praesidium 用 clang) で使えることを確認し、この表に追記してから使う。
  表に無い C++23 機能は「未確認 = 使わない」として扱う。C++26 以降の機能は不採用 (標準の上限は C++23。§C4.1)。
  - 標準ライブラリ機能の有無は `__cplusplus` ではなく feature-test マクロ (`__cpp_lib_expected` など) で判定する
    (GCC 13 の `-std=c++23` では `__cplusplus` が 202100L で、版の比較を誤る)。
  - (推奨) ranges の views のパイプラインを `ERGO_HOT` の関数や毎フレームのループに入れない。
  - 根拠: Praesidium (RV-PRAESIDIUM-03) は TU ごとに `clang --analyze` を実行するので BMI 前提の import を解析できない。MSVC・Xcode・NDK の間で BMI に互換性がない。
  - 担保: [hook + gate — CMake `CMAKE_CXX_SCAN_FOR_MODULES OFF`、規則表の `^\s*(export\s+)?module\b|^\s*import\s+[<\w"]|\bco_(await|return|yield)\b`]
  - 関係: RULE_CODE §18 を言語機能へ拡張

  | 機能 | 採否 | 条件・理由 |
  |------|------|-----------|
  | concepts / requires / `std::span` / `std::bit_cast` / `<bit>` / `std::endian` / `std::numbers` / `std::cmp_*` / 指示付き初期化子 / `char8_t` | 採用 | C++20 の前提機能 (§C1〜§C8 が依存) |
  | ranges のアルゴリズム | 採用 | views のパイプラインは上の (推奨) を参照 |
  | modules (`module` / `import`) | 不採用 | Praesidium の TU 単位解析と toolchain 間の BMI 非互換 |
  | coroutine (`co_await` 等) | 不採用 | 例外境界 (§C5.3) とフレーム寿命の扱いが未整備 |
  | 浮動小数の `std::from_chars` | 不採用 | Xcode 16 / NDK r27 の libc++ に無い。§C2.2 の共通ヘルパを使う |
  | 浮動小数の `std::format` | 不採用 | Apple の deployment target で使えない。整数・文字列の `std::format` は採用 (推奨止まり、§C2.1) |
  | `std::expected` (C++23) | 条件付き | 直接使わず、§C5.1 の `Expected` の alias 先としてだけ使う |
  | その他の C++23 機能 | 未確認 | 4 toolchain で確認後、この表へ行を足す PR を先に出す |
  | C++26 以降の機能 | 不採用 | §C4.1 の上限 (C++23) |
- **§C1.8 実行時ロードと外部 C ABI のミラー — 必須**:
  - (1) 実行時にロードするライブラリは絶対パスに解決し、解決できなければエラーにする (相対パスへの縮退は禁止)。
    Windows は `LoadLibraryExW(path, nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32)` を使い、
    `LoadLibrary(A|W)` は禁止。POSIX は `RTLD_NOW | RTLD_LOCAL` を使う。
  - (2) 外部 C ABI の手書きミラーはライブラリごとに 1 つの `<lib>_abi.h` に置き、対象とする上流の版を書き、
    全 struct に `sizeof` と `offsetof` の static_assert を付ける。TU 内へのコピーは禁止。
  - (3) ロード時に版シンボルか版 API を検査し、不一致なら拒否する。シンボルはロード時に 1 つの関数表へ全部解決する。
  - (4) ロードしたライブラリからのコールバックは §C5.3 の noexcept 境界とする。
  - 根拠: `Ludellus-Native/native/src/input/mediapipe_hand_source.cpp:42-114` と `mediapipe_pose_source.cpp:40-` が `MpBaseOptions` 等のミラーを重複して持ち、static_assert は 0 件。hand_source.cpp:264 は `if (resolve_error) resolved = library_file;` で相対パスへ黙って縮退し、:267 は検索フラグなしの `LoadLibraryW` で DLL planting の余地がある。
  - 担保: [hook + gate — 規則表が `\bLoadLibrary(A|W)?\s*\(` を禁止し、`dlopen\(` / `LoadLibraryExW\(` を `*_loader.cpp` の外で検出。`<lib>_abi.h` の static_assert のコンパイル。Praesidium tripwire への `LoadLibrary` 追加を Revisor に提案]
  - 関係: RULE_CODE §13 の隣接領域。local-app/REVIEW_VULNERABILITY_LOCAL (DLL サイドローディング) を書く側から具体化

## C2. Revisor の脆弱性対応を取り込む

- **§C2.1 禁止 API を Praesidium より広く定める — 必須**: 新規・変更するコードでは、Praesidium の 7 関数
  (`gets|strcpy|strcat|sprintf|vsprintf|wcscpy|wcscat`) に加えて、`strncpy`、`strtok`、`scanf/sscanf/fscanf`、
  `atoi/atol/atof`、`std::sto*`、`alloca`、`rand/srand` を使わない。
  - 書式文字列がリテラルでない printf 系と std::format 系も禁止する。
  - `snprintf` は、上限が `sizeof(配列)`・書式がリテラル・戻り値を `n < 0 || n >= sizeof(buf)` で検査、の 3 条件を満たす形だけ許す。
  - 例外はリポに 1 つのロガー実装ファイル (§C8.4) の `vsnprintf` 転送に限り、§C9.4 の形式で `#pragma warning(disable: 4774)` を push/pop する。
  - 加えて、clang-tidy `bugprone-unsafe-functions` が LLVM 19 で報告する既定一覧と More 一覧 (`asctime`・`setbuf`・`rewind`・`vfork`・`bcopy` など) も禁止とする。
  - (推奨) 文字列の組み立ては `std::format` を使う (必須にはしない。浮動小数は §C1.7 の表に従う)。
  - 根拠: `Ergo/src/ui_layout/binding.cpp:62` (sscanf)。`src/custos/http_server.cpp:100` は外部の Content-Length を stoul で読み、`-1` が巨大値に折り返す。`Ludellus-Native/native/src/render/avatar_sdf_report.cpp:10-13` は非リテラル書式を snprintf に渡す。
  - 担保: [hook + gate — 規則表 (§C2.1 で追加した関数の主担保)、Praesidium tripwire (rules.mjs) の hook 実行。gate — `-Wformat=2` (MSVC `/w44774`。`-Werror=format-nonliteral` / `-Werror=format-security` / `/we4774` へのエラー化は §C4.3)、clang-tidy `bugprone-unsafe-functions` (LLVM 19 の既定一覧と More 一覧だけ。関数名を足す CustomFunctions は LLVM 20 以降)・`cert-err34-c` (atoi 系)・`cert-msc50-cpp` (rand)・`cert-err33-c`。`native.banned-api` の拡張を Revisor に提案]
  - 関係: 新規 (RULE_CODE §13 は外部プロセス起動の規定でありそちらに委ねる)
- **§C2.2 文字列から数値への変換 — 必須**: 整数は `std::from_chars` で変換し、`ec` と全文字を消費したことを検査する。
  浮動小数は共通ヘルパ 1 箇所 (例: `ergo::parse_double`。ロケール非依存、Expected を返す) を経由する。
  `std::sto*` を catch と組み合わせて成否を判定する書き方、失敗時に既定値へ化けさせる書き方は禁止。
  - 根拠: `Ergo/src/shuriken_migrator/migrator.cpp:56-153` (105 行目は空の `catch(...)`)、`src/ui_layout/binding.cpp:16`。浮動小数の from_chars は Xcode 16 と NDK r27 の libc++ に無い。
  - 担保: [hook + gate — 規則表の `std::sto(i|l|ll|ul|ull|f|d|ld)\(`。gate — clang-tidy `cert-err34-c` (LLVM 20 で `bugprone-unchecked-string-to-number-conversion` に改名される。固定版の 19 にはこの名前しか無い)]
  - 関係: RULE_CODE §9 の具体化
- **§C2.3 信頼境界のバイト列は境界付きリーダで読む — 必須**: 外部由来のバイト列は、読むたびに残量を検査する `ByteReader` を通して読む。
  - ヘッダ長・本体長・要素数・チャンク長には名前付き定数の上限を置き、超えたら確保・seek・recv の **前に** 拒否する。
  - 外部由来の長さを、検査なしで `reserve` / `resize` / `seekg` / `recv` に渡さない。
  - **テンプレートは薄い型の層に限る**。残量と長さの検査は非テンプレートの .cpp 関数 (例: `take_bytes(size_t) -> Expected<std::span<const std::byte>>`) に実装し、
    ヘッダの `take<T>()` はそれを呼んで §C2.5 の復元をするだけにする (Praesidium はヘッダだけの変更を解析しないため)。
  - 根拠: `Ergo/src/custos/http_server.cpp:116-120` は本体を上限なしで recv する。`src/sound/audio_decoder.cpp:97-104` は検査なしで seekg する。`Ludellus-Native/native/src/world/proto/bytes.h:48-49` の `take<T>()` は検査がヘッダ内にあり、分担の是正対象。
  - 担保: [gate — cpp-tidy で `clang-analyzer-optin.taint.TaintedAlloc` を有効化する (LLVM 19 で名前付きで使える taint 系はこれだけ。既定の taint source は scanf 系で、fread / recv で読んだ長さは検出しない)。recv / read / fread を source にする GenericTaint の Config は LLVM 20 以降で入れる (「未実装の担保」)。それまでは §C3.8 のコーパス再生 CTest と Praesidium native 解析が主担保。checker 集合への `optin.taint` 追加を Revisor に提案]
  - 関係: RULE_CODE §9・§12、RV-PRAESIDIUM-02 のネイティブ版
- **§C2.4 バイナリレイアウトを固定する — 必須**: GPU バッファ・wire・ファイル形式とバイト列を共有する struct には、
  `static_assert(sizeof)`、全フィールドの `offsetof`、`std::endian` の明示を必須とする。外部由来の入力を struct へ直接
  `read` / `memcpy` / `reinterpret_cast` することは禁止し、フィールドごとにバイト順を明示して読む。GPU 側の正本は §C2.12。
  - 根拠: `Ergo/src/gpu_particle/particle_system.cpp:24` の `EmitterUBO` に static_assert が無い。`src/sound/audio_decoder.cpp:38-58,82-99` は pack した struct へ直接 read する。
  - 担保: [hook + gate — 規則表が `vkCmdPushConstants` / `memcpy(mapped` に渡す型と同じファイルに static_assert が無い場合を検出。§C2.12 の reflection CTest]
  - 関係: RULE_CODE §12 の具体化
- **§C2.5 型パンと reinterpret_cast は許可リスト制 — 必須**: `reinterpret_cast` は次の 2 つに限り、
  `// NOLINT(cppcoreguidelines-pro-type-reinterpret-cast): <理由> (§C2.5)` を付ける。
  (a) OS / C API の境界 (sockaddr、dlsym、void**)、(b) `char*` / `std::byte*` / `unsigned char*` との相互変換。
  - 自前の union による型パンは禁止し、新しい直和型は `std::variant` で書く (Vulkan 等の C 定義 union と既存の tagged union は対象外)。
  - バイト列からの値の復元は 1 箇所にまとめ、trivially-copyable concept と `std::bit_cast` で行う。長さ検査は §C2.3 の .cpp 側。
  - SPIR-V は `std::vector<uint32_t>` で読み、サイズが 4 の倍数であることを検査する。
  - 根拠: 同じ SPIR-V ローダが 3 箇所にコピーされている (`Ergo/src/particle/renderer.cpp:195-200`、`src/render/stage_renderer.cpp:228-234`、`Ludellus-Native/native/src/render/color_primitive_batch.cpp:34`)。
  - 担保: [hook + gate — 規則表 (注釈の無い `reinterpret_cast`)。gate — clang-tidy `cppcoreguidelines-pro-type-reinterpret-cast`・`bugprone-casting-through-void`、UBSan alignment。`pro-type-union-access` は使わない]
  - 関係: 新規
- **§C2.6 キャストと縮小変換 — 必須**: C スタイルキャストと関数形式キャストは禁止。`.size()` に由来する値、プロトコルの長さ・要素数・
  オフセットを **狭い型** (変換先のビット幅が小さい、または符号が変わる型) へ入れるときは `narrow<T>()` (値が変わったら失敗を返す) を使う。
  素の `static_cast` は、直前の比較で上限を保証している場合に限る。境界層の target には `-Wconversion -Wsign-conversion` を必ず付ける (baseline の `ludiars_cxx_enable_strict_warnings`)。
  - 根拠: `Ludellus-Native/native/src/world/proto/datagram.cpp:32` は `static_cast<uint16_t>(rows.size())` で黙って切り詰める。`.size()` から狭い型への変換は 40 件。
  - 担保: [hook + gate — 規則表 (C スタイル・関数形式のキャスト、`static_cast<(int|u?int(8|16|32)_t)>\([^)]*\.size\(\)\)`)。gate — clang-tidy `cppcoreguidelines-pro-type-cstyle-cast`・`google-readability-casting`、境界層の strict warnings。境界層の target と fuzz_corpus の CTest には、baseline の `ludiars_cxx_enable_sanitizers(<target> IMPLICIT_CONVERSION)` で clang の `-fsanitize=implicit-integer-truncation,implicit-integer-sign-change` を付ける (clang 以外では未実施を検証結果に書く)]
  - 関係: RULE_CODE §8 の具体化
- **§C2.7 整数オーバーフロー — 必須**: 外部由来の値を含むオフセット・長さ・要素数の計算は、オーバーフローしない比較の形
  (`len > size - offset`、`count > max / stride`) で事前に検査する。sizeof を引く減算は、被減数が sizeof 以上であることを先に確かめる。
  符号付きと符号なしの比較には `std::cmp_*` を使う。
  - 意図した wraparound (ハッシュ、チェックサム、§C7.2 の RNG) は `ergo::wrapping_mul` などの専用関数に閉じ、その関数を §C3.7 の suppression ファイルに
    理由付きで登録する (`-fsanitize=unsigned-integer-overflow` は定義された wraparound も報告するため)。
  - 根拠: `Ergo/src/sound/audio_decoder.cpp:97-104`。正しい例は `Ludellus-Native/native/src/render/swapchain_capture.cpp:207`。
  - 担保: [gate — `-Wsign-compare`、§C3.7 の UBSan、境界層に `ludiars_cxx_enable_sanitizers(<target> UNSIGNED_INTEGER_OVERFLOW)` (clang の `-fsanitize=unsigned-integer-overflow`)]
  - 関係: REVIEW_VULNERABILITY の整数オーバーフロー項目を書く側から定めたもの
- **§C2.8 未初期化を作らない — 必須**: 新規・変更するローカル変数とメンバは宣言時に初期化する。Vulkan や OS の C 構造体は `{}` で値初期化してから
  フィールドを設定する。性能のために未初期化を意図するバッファは、理由コメント付きの専用型でだけ許す。
  - 根拠: pNext の未初期化はドライバ内部の UB になり追跡できない。既存コードは概ね `{}` で書かれている (`Ergo/src/particle/renderer.cpp:197`)。
  - 担保: [gate — clang-tidy `cppcoreguidelines-init-variables`・`cppcoreguidelines-pro-type-member-init` (警告扱い)、clang/gcc の debug・sanitizer preset で `-ftrivial-auto-var-init=pattern`]
  - 関係: 新規
- **§C2.9 標準ライブラリの hardening — 必須**: debug・テスト・sanitizer の preset では、`ludiars_cxx_warnings` を通して
  `_GLIBCXX_ASSERTIONS` と `_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_EXTENSIVE` を付ける。MSVC は既定の `_ITERATOR_DEBUG_LEVEL` を上書きせず (LNK2038 回避)、ABI を変えない `_MSVC_STL_HARDENING=1` を付ける。
  `std::out_of_range` を catch して分岐する書き方はしない。
  - 根拠: Ergo と Ludellus-Native の CMake に hardening の定義が 0 件。ホットパスで `at()` を強制すると frame budget と衝突するので、検査はライブラリ側の hardening に任せる。
  - 担保: [gate — baseline の `LUDIARS_CXX_HARDENING` (debug・テスト・sanitizer の preset で ON) と CTest]
  - 関係: 新規
- **§C2.10 praesidium.json の登録と同期 — 必須**: C/C++ を含むリポはルートに `praesidium.json` を置き、新規・変更した TU を同じ PR で登録する。
  - 変更した TU の `standard` / `includes` / `defines` は、Ninja preset の `compile_commands.json` と一致させる。
  - リポ外の include は、コミット済みの「パス prefix → packages 名」対応表で写像する。
  - ヘッダだけの変更が解析されない coverage gap は規約では塞げないので、ヘッダから TU を導出する `covers` の追加を Revisor に提案する。
  - 根拠: 未登録 TU は Praesidium が fail-closed で落とす。Ergo には `praesidium.json` が無い。`Ludellus-Native/praesidium.json` は 192 件を手書きしている。
  - 担保: [gate — RV-PRAESIDIUM-03、変更 TU だけを照合する `praesidium-config-sync` CTest]
  - 関係: 新規
- **§C2.11 Praesidium の結果の読み方 — 必須 (レビュー側)**: レビューでは少なくとも次の 4 点を確認する (全項目は `common/REVIEW_VULNERABILITY.md` の C/C++ 節)。Praesidium の pass だけを根拠に、
  メモリ安全の CWE 項目を済みにしてはならない。
  - (1) `coverage.nativeScope` が `changed` か `repository` か。
  - (2) ヘッダだけの変更は coverage gap であって pass ではない。
  - (3) findings 0 件は安全の証明ではない。
  - (4) diagnostics は保持されないので、ローカルで再現する。
  - 根拠: `Revisor/spec/feature/praesidium.md` の RV-PRAESIDIUM-01 / 03。
  - 担保: [memory — `common/REVIEW_VULNERABILITY.md` の必須項目と ludiars-review の出力欄。gate (未実装) — `check-rule-ids` の対応漏れ検査 (§C9.1)。実装されるまでは memory だけ]
  - 関係: RULE_CODE「運用」(規約が表、レビューが裏) の C++ 版
- **§C2.12 シェーダと C++ の型共有 — 必須**:
  - (1) 複数のシェーダが共有する GPU struct は `shaders/include/<name>.glsl` の 1 箇所に定義し、`#include` (glslc `-I`) で使う。シェーダ間の手書きコピーは禁止。
  - (2) 対応する C++ struct には sizeof と全フィールドの `offsetof` の static_assert を書く。vec3 の後のフィールドは std430 / std140 に沿って明示的に pad する。
  - (3) GPU target をビルドする限り、シェーダの bake は必須。glslc が無ければ `FATAL_ERROR` (§C4.6 の拡張)。
  - (4) レイアウト照合に使う `spirv-cross` も、GPU target が ON のときは必須とし、見つからなければ glslc と同じく `FATAL_ERROR` にする。
  - (5) .spv は CMake の生成物として target に依存を張り、実行時の探索パスはビルド設定から渡す。
  - 根拠: `Ergo/shaders/particle_update.comp:14-36` と `particle_spawn.comp` が `struct Particle` を二重定義。C++ 側 `include/ergo/gpu_particle/particle_state.h:9-42` はオフセットがコメントの表で、検査は sizeof==64 だけ。`Ergo/CMakeLists.txt:395-416` と `Ludellus-Native/native/CMakeLists.txt:1086-1087` は glslc が無いと「SPIR-V bake skipped」の STATUS で済ませる。`sdf_mesh_bvh.h:29,39`・`avatar_sdf_pose.h:41` も sizeof だけ。
  - 担保: [gate — CTest `shader_layout_<module>` が `spirv-cross --reflect` の SSBO/UBO メンバオフセットと C++ の offsetof を照合。CMake で GPU target ON かつ glslc / spirv-cross 無しを FATAL。hook + gate — 規則表が、`shaders/*` の GPU 型を変更したのに対応ヘッダとレイアウトテストが変更集合に無い場合を検出]
  - 関係: RULE_CODE §6 (DRY)・§7.1、§C2.4 の具体化
- **§C2.13 UTF-8 の文字列とパスの境界 — 必須**:
  - (1) 内部の `std::string` は UTF-8。`std::string` と `std::filesystem::path` の相互変換は、リポに 1 つの
    `<repo>::io::path_from_utf8()` / `path_to_utf8()` (char8_t 経由) で行う。外部のパスに `std::filesystem::path(std::string)`、
    `std::filesystem::u8path`、std::string を直接渡す `std::ifstream` / `std::ofstream` / `fopen` を使わない。
  - (2) Win32 の文字列は W 系 API だけを使い、`*A` API は禁止。UTF-8 と UTF-16 の変換は 1 つの `widen` / `narrow_utf8` に集約し、
    `MB_ERR_INVALID_CHARS` を付け、戻り値 0 を Expected のエラーにする。
  - (3) パスや識別子を固定長の char 配列に snprintf で組み立てない (§C2.1 の戻り値検査はやむを得ない場合の最低条件)。
  - 根拠: `Ergo/src/io/file.cpp:14-20` の to_fs は `fs::path(p)` なので MSVC では ACP 解釈になり日本語パスが化ける (activeCodePage マニフェストは 0 件)。`src/scene/scene.cpp:133-145` は ifstream に std::string を直渡し。u8path は Ergo/src に 25 件 (C++20 で deprecated)。`Ludellus-Native/native/src/personal/utf8_path.h:10-17` と `world/riddle/riddle_progress_store.cpp:30-36` が同じ変換を重複保持。MultiByteToWideChar のラッパが 5 つ別々にあり (`render/dwrite_text_rasterizer.cpp:26` ほか)、どれも flags 0 で戻り値 0 を検査しない。
  - 担保: [hook + gate — 規則表が helper の外の `u8path\(|std::filesystem::path\(\s*\w+\s*\)|MultiByteToWideChar|WideCharToMultiByte` を検出。`-Wdeprecated-declarations` (MSVC C4996。エラー化は §C4.3)、`cert-err33-c`。CTest で一時ディレクトリ下に日本語名ディレクトリを作り、全 io helper の read / write / rename を往復]
  - 関係: RULE_CODE §12・§17 を C++ のパスへ具体化

## C3. テスト

- **§C3.1 テストフレームワーク — 必須**: Ergo と、Ergo を取り込むリポ (Ludellus-Native / AdventureCube / KuzuSurvivors) は、
  Ergo の mini-gtest を、Ergo が公開する CMake target `ergo_gtest_main` (include ディレクトリを PUBLIC で伝える。§C4.8 の改名後はその新しい名前) を
  リンクして使う。`third_party/gtest` をパスで include することや、`add_subdirectory` でパスを借りることはしない (§C4.8)。
  本家 gtest、Catch2、doctest、gmock は追加しない。足りないマクロは Ergo へ PR で追加する。
  Ergo が依存する下位ライブラリの Pictor (Ergo を取り込むと循環依存になる) は対象外とし、自リポの既存基盤を 1 つに固定して 2 つ目を足さない。
  Pictor は `cpp-rules.json` の `"disable": { "C3.1": "<理由>" }` で規則表の §C3.1 を外す (§C9.5)。
  - mini-gtest の罠 (本家との違い): ASSERT は void 関数内でしか使えない / `EXPECT_EQ` は一時オブジェクトの寿命を延ばさない /
    `EXPECT_FLOAT_EQ` / `EXPECT_DOUBLE_EQ` は ULP ではなく絶対誤差 1e-5 / 1e-9 で比較する / `ASSERT_LT`・`ASSERT_NEAR`・`EXPECT_THROW` などが未実装。
  - 根拠: `Ergo/third_party/gtest/gtest.h` の 1 行目 (オフライン環境前提)。パスで借りている違反例は §C4.8 の根拠。
  - 担保: [hook + gate — 規則表が `FetchContent_Declare(googletest|Catch2|doctest)` と `#include <catch2/|<doctest/|<gmock/` を検出]
  - 関係: RULE_CODE §18 の具体化
- **§C3.2 置き場所と登録 — 必須**: テストは `tests/<module>/test_<unit>.cpp` に TEST / TEST_F で書く。tests/ の下に独自の `int main` を持つテストを新しく作らない。
  新規テストと手を入れたテストは共通の CMake 関数 (例: `ergo_add_test(<name> DOMAIN <label>)`) で登録する。この関数が add_executable、main のリンク、
  baseline のリンク、add_test、LABELS をまとめて設定する。
  - 根拠: `Ergo/CMakeLists.txt` では手書きの登録が約 40 箇所で重複。`tests/packages/test_git_remote_source.cpp:25` は独自 main を持つ。
  - 担保: [hook + gate — 規則表が tests/ の下の `int main(` を検出]
  - 関係: RULE_TEST §2 の具体化
- **§C3.3 テスト基盤が無いときは configure で止める — 必須**: `<PREFIX>_BUILD_TESTS=ON` なのに gtest や必須の依存が見つからないときは `FATAL_ERROR` にする。
  WARNING を出してテスト target を作らずに済ませる書き方は禁止。利用者が明示的に OFF にした場合のスキップは許す。ctest には常に `--no-tests=error` を付ける。
  - 根拠: `Ludellus-Native/native/CMakeLists.txt` の 155・293・323・353・440・567・779・1371 行がテストを黙って落とす。手本は `Ergo/CMakeLists.txt:117-119` の "No silent fallback"。
  - 担保: [gate — CMake と ctest]
  - 関係: RULE_CODE §7.1 の具体化
- **§C3.4 Revisor への登録テスト — 必須**: **C++ リポはビルド・テスト用の GitHub Actions workflow (ci.yml など) を置かず、検証は Revisor の登録テストで回す**
  (RULE_TEST §1 の再確認)。AIFormat が配信する `harness.yml` は本規約の対象外で、扱いは配信元 ([`scripts/HARNESS_CHECKS.md`](./scripts/HARNESS_CHECKS.md)) に従う。
  次の 4 件を `kinds` 付きで登録し、登録後に読み戻して確認する。
  - `cpp-format` [code, test, config] — §C9.3
  - `cpp-tidy` [code, test, config] — §C9.3
  - `cpp-build-policy` `always: true` — 規則表を merge-base の diff に適用 (§C9.5)。diff への正規表現適用だけで軽く、`CMakeLists.txt` だけの変更も拾える
  - `ctest` [code, test, config, infra] — `cmake --preset verify` → build → `ctest --preset verify --output-on-failure --no-tests=error`
    (§C4.1 の条件では `verify-cxx23` も同じ手順で回す)
  - §C3.7 の sanitizer preset は別ビルドツリーを要するので、上の 4 件とは別に `ctest-asan-ubsan` [code, test, config, infra] として追加登録する。
  - Revisor は `CMakeLists.txt` を docs (拡張子 .txt のため)、`*.cmake` とシェーダを code、`CMakePresets.json` とツール設定 (`.clang-format` / `.clang-tidy` /
    `praesidium.json` / `cpp-rules.json`) を config に分類する (`Revisor/src/change-classification.mjs`)。上の `kinds` はこれに合わせて固定している。
    `CMakeLists.txt` だけの変更で `ctest` が選ばれない欠落は、Revisor が `CMakeLists.txt` を infra に分類するまで残る (その間は `cpp-build-policy` だけが回る)。
  - ctest をモジュール単位に絞るのは、`cmake --graphviz` か Anatomia の依存グラフで、変更 target に推移的に依存する全 target の LABELS を含める場合に限る。
  - 根拠: Ergo の add_test は 54 件、LABELS は 0 件。`Revisor/spec/tasks/2026-09-01-registered-test-kinds-rollout.md`。
  - 担保: [gate — Revisor の登録テスト]
  - 関係: RULE_TEST §1・§4 の具体化
- **§C3.5 concept は両側からテストする — 必須**: 公開ヘッダで concept を定義・変更する PR では、`tests/<module>/test_<module>_concepts.cpp` に
  満たす例 `static_assert(C<T>)` と満たさない例 `static_assert(!C<T>)` を書く。満たさない例には境界になる型 (bool、char、ポインタ、参照、該当しない struct) を
  1 つ以上含める。新規・変更した constexpr 関数は、境界値 (0、型の最小値、型の最大値) と通常値を 1 つずつ static_assert で確かめる。
  - 根拠: Ergo/tests の static_assert は 0 件。`include/ergo/math/concepts.h:21` の `Arithmetic` は bool を受け付けてしまう。
  - 担保: [hook + gate — static_assert のコンパイル、規則表が concepts.h の変更に対応テストが diff に無い場合を検出]
  - 関係: RULE_TEST §2 (公開 API の契約テスト) の具体化
- **§C3.6 ヘッダの自己完結性とインスタンス化の検査 — 必須**: 新規・変更した公開ヘッダは `FILE_SET HEADERS` で宣言し、verify preset で
  `VERIFY_INTERFACE_HEADER_SETS ON` と `all_verify_interface_header_sets` をビルドする。このため C++ リポの `cmake_minimum_required` は **3.24 以上** とする。
  既存の違反ヘッダは除外リストに載せ、変更したときに外す。ヘッダだけで完結するテンプレートには、§C3.5 の満たす例と同じ型で明示的インスタンス化を 1 つ以上置いたテスト TU を置く
  (Praesidium の coverage gap を塞ぐものではなく、ローカルでの補完)。
  - 根拠: `praesidium.md:119-120` の "header-only change compiles no unit"。代わりに生成 TU 方式を自作すると保守負担が増える。
  - 担保: [gate — CMake 3.24+ と CTest]
  - 関係: RULE_CODE §2 の具体化
- **§C3.7 sanitizer の preset — 必須**: C++ リポは `asan-ubsan` preset を持つ。
  - clang / gcc: `-fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer`。
  - MSVC: `/fsanitize=address` だけを使い、/RTC・/ZI・/INCREMENTAL を外す。MSVC では UB を検査していないことを検証結果に書く。
  - GPU やデバイスを要するテストは LABELS `gpu` を付けて除外する。
  - `asan-ubsan` preset の test 環境に `ASAN_OPTIONS=detect_stack_use_after_return=1` を置く (§C6.5)。
  - thread / atomic / mutex を変更する PR は、clang のホストで `tsan` preset (`-L concurrency`) も実行する。clang のホストが無い場合は、未実行であることを PR 説明に書く。
  - 誤検知は理由と Issue 番号を書いた suppression ファイルで抑える。`no_sanitize` 属性は使わない。
  - 根拠: `praesidium.md:166-171` は "sanitizers remain complementary"。Ergo の CMakePresets.json に sanitizer の preset が無い。
  - 担保: [gate — `ctest --preset asan-ubsan -LE gpu` を `ctest-asan-ubsan` [code, test, config, infra] として登録 (§C3.4)]
  - 関係: RULE_TEST §1 の具体化
- **§C3.8 デコーダには fuzz とコーパス回帰を付ける — 必須**: 新規・変更するデコーダ (音声、JSON、wire、シーン、セーブ。パスかファイル名が規則表と同じ正規表現
  `decoder|parser|codec|protocol|deserial|reader|save|(scene|asset)_?loader` に一致するもの。§C1.8 の実行時ロード `*_loader.cpp` は対象外) には、同じ PR で `fuzz/<module>/fuzz_<target>.cpp` (`LLVMFuzzerTestOneInput`) とシードコーパスを用意する。
  - コーパスは libFuzzer が無い環境でも全件を流す CTest `fuzz_corpus_<target>` (LABELS `sanitize`) として常に回す。例外の送出もクラッシュと同じく失敗とする (§C5.2)。
  - クラッシュした入力はコーパスに追加する。libFuzzer による本番実行は clang のホストで任意に行う。
  - 根拠: `Ergo/src/sound/audio_decoder.cpp:81-115` はチャンクサイズを検証していない。fuzz/ ディレクトリは存在しない。
  - 担保: [hook + gate — CTest、規則表が上記パスの変更にハーネスが無い場合を検出]
  - 関係: RULE_TEST §3 の具体化
- **§C3.9 consumer のリンクテスト — 必須**: ホストに add_subdirectory で取り込まれるライブラリは `tests/consumer/` に最小のホストを置く。
  このホストは公開 target を全部リンクし、公開ヘッダを全部 include した TU をビルドする。`ctest --build-and-test` として登録する。
  §C4.10 の ODR 検査 (片方の TU だけ設定マクロを変えた 2 TU をリンクし、未定義シンボルか `detect_mismatch` で失敗することを確かめる) もここで行う。
  担保できるのは CMake レベルの整合 (target 名、include の伝播、定義、/utf-8、標準) だけで、実ホストのリンクはホスト側の pin 更新 PR で確かめる。
  - 根拠: `Ergo/spec/setup/build-cpp.md:127-128` に「/utf-8 が consumer に伝播しない」罠。KuzuSurvivors でリンクに失敗した前例。
  - 担保: [gate — consumer リンクテストを `kinds` [code, config, infra] で登録 (§C3.4)]
  - 関係: RULE_TEST §2 (consumer のリンクテスト) の具体化
- **§C3.10 GPU や外部 SDK の分離 — 必須**: テストの preset では外部 SDK のバックエンドを明示的に指定し、`auto` で黙って dummy に縮退した状態で green にしない。
  実デバイスを要するテストは LABELS `gpu` か `device` を付け、デバイスのある環境用の別ケースとして登録する。そのケースではデバイスが無いことを skip による成功にしない。
  - 根拠: `Ergo/CMakeLists.txt:71` は `ERGO_AUDIO_BACKEND auto`。手本は `tests/render/test_render_backend.cpp` (KD-MOB-001)。
  - 担保: [gate — preset と LABELS]
  - 関係: RULE_CODE §7.1 の具体化
- **§C3.11 決定性のテスト — 必須**:
  - §C7.2 の対象層は、固定 seed または偽の時計で 2 回実行し、結果が一致することを assert する。
  - §C7.4 に準拠した層は、固定 seed のゴールデン出力を MSVC / libc++ / libstdc++ の各ビルドで **bit 一致** で照合する。許容誤差付きに緩めることは禁止し、不一致は §C7.4 違反としてコードを直す。
  - SIMD を持つ関数は、同じ入力 (n%4 の端数を含む) で SIMD 経路と scalar 経路を `memcmp` で比較する。両経路は §C4.10 の inline namespace (`simd_v1` / `scalar_v1`) で同じビルドに共存させ、テストから直接呼ぶ。
    設定マクロを TU 単位で `-D` 上書きした別 target は作らない (§C4.10 が禁止する形になるため)。
  - 根拠: RULE_TEST の「リプレイ」は決定性が前提。`Ergo/include/ergo/math/batch.h:14` は bit 一致を宣言しているが検査が無い。
  - 担保: [gate — CTest]
  - 関係: RULE_CODE §16 の具体化
- **§C3.12 Augur の扱い — 必須**: Augur の `contract-wrap` と `augur.contracts.json` は TS/JS 専用なので、C/C++ のファイルを登録しない。
  C++ の契約は concept、static_assert、gtest の契約テストで表す。テスト計画 (augur plan と Anatomia の test-suggestions) は C++ でも使う。
  C++ のコードについて「Augur 契約済み」と報告してはならない。
  - 根拠: `Augur/spec/feature/log-injection.md` は TypeScript compiler API で動く。Ergo の C-1 / C-2 は .mjs の検証スクリプト。
  - 担保: [gate — `cpp-build-policy` に拡張子検査を含める]
  - 関係: RULE_TEST §2 の具体化

## C4. ビルド基盤・ツールチェイン

- **§C4.1 標準は C++20 を下限とする — 必須**: 自リポの C++ target は **C++20 を下限** とし、拡張は OFF にする。
  4 toolchain (§C1.7) で確認できた範囲で **C++23 を選んでよい** (許可であり義務ではない)。C++23 機能の採否は §C1.7 の表で管理する。
  - 標準は `ludiars_cxx_usage` が `target_compile_features(INTERFACE cxx_std_<N>)` で付与し、PUBLIC リンクで consumer まで伝播させる。
    target ごとの `set_target_properties(... CXX_STANDARD)` や `cxx_std_*` は禁止。C++23 を選ぶときは、最上位で `LUDIARS_CXX_STANDARD=23` を設定する
    (許可値は 20 / 23、既定 20。指定方法は `cpp/README.md`)。
  - 同一ビルドに複数の LUDIARS リポが入るとき、baseline target は最上位で一度だけ定義されて共用され、標準は最上位の指定で決まる。
  - 下位ライブラリ (Ergo / Pictor) が C++23 を下限にする (C++23 機能を必須にする) のは、そのライブラリを取り込む全ホスト
    (Ludellus-Native / AdventureCube / KuzuSurvivors) の `LUDIARS_CXX_STANDARD` を 23 にする pin 更新 PR を同時に出す場合に限る。
    それまでは `LUDIARS_CXX_STANDARD=20` と `=23` の両方の verify preset (`verify` / `verify-cxx23`) を `ctest` 登録テスト (§C3.4) で回し、
    両方でビルドできることを gate で確かめる (§C5.1 の alias はこれを前提に設計する)。
  - 根拠: `Ergo/CMakeLists.txt:4` は C++17 で、686・715・1051・1099 行がそれぞれ別の方式で 20 に上げている。CXX_STANDARD プロパティは consumer に伝播しないので、`concepts.h` を include した C++17 のホストが壊れる。
  - 担保: [hook + gate — 規則表の `CXX_STANDARD [0-9]+` と target の `cxx_std_*`。gate — CMake configure での検査 (`ludiars_cxx_check_targets`)、下位ライブラリでは `verify` / `verify-cxx23` の両 preset]
  - 関係: RULE_TECH_STACK の補完
- **§C4.2 共通設定を 2 つの baseline target に集める — 必須**: 各リポは `cpp/LudiarsCxxBaseline.cmake` の同期コピーを include し、次の 2 つをリンクする。
  - (a) `ludiars_cxx_usage`: 全 target が **PUBLIC** でリンクする。consumer にも必要な使用要件だけを持つ (標準、MSVC の `/utf-8 /Zc:__cplusplus`、§C7.4 の fp フラグ)。
  - (b) `ludiars_cxx_warnings`: 全 target が **PRIVATE** でリンクする。警告 (§C4.3)、`NOMINMAX`、`WIN32_LEAN_AND_MEAN`、§C2.9 の hardening を持つ。
  - 禁止: target ごとの `/utf-8`、ソース内の `#define NOMINMAX`、ライブラリでの `CMAKE_MSVC_RUNTIME_LIBRARY` 設定、`_USE_MATH_DEFINES` の配布。
  - `/permissive-` と `/Zc:preprocessor` は opt-in。
  - リンク有無の検査 (`cmake_language(DEFER)`) は自リポの target だけを対象にし、移行期間中は WARNING、移行完了後は FATAL_ERROR にする。
  - 根拠: Ergo では `/utf-8` が 36 行あり PUBLIC と PRIVATE が混在。`ergo_render` の PUBLIC /utf-8 (CMakeLists.txt:721) は consumer への伝播対策で、Ergo/include の非 ASCII 公開ヘッダは 151 件あるので usage target で一般化する。ergo_bind には /utf-8 が無いのに `src/bind/variable_registry.h:45` に非 ASCII がある。`NOMINMAX` の #define が 8 ファイルに重複。
  - 担保: [hook + gate — 規則表の target 個別 `/utf-8`、ソース内の `#define NOMINMAX|WIN32_LEAN_AND_MEAN`、PUBLIC / INTERFACE の `_USE_MATH_DEFINES`。gate — CMake configure (`ludiars_cxx_check_targets` の DEFER)]
  - 関係: RULE_CODE §17 の「個別付与」を置き換える
- **§C4.3 警告 — 必須**: `ludiars_cxx_warnings` の警告は次のとおり。正確な一覧は `cpp/LudiarsCxxBaseline.cmake` を正とし、本書の各 §C が要求するフラグはすべてここに含める。
  - clang / gcc: `-Wall -Wextra -Wnon-virtual-dtor -Wformat=2 -Wsign-compare` (Praesidium と同じ -Wall -Wextra に §C1.5・§C2.1 の分を足す)。
    clang では `-Wthread-safety` (§C6.6)・`-Wdangling-gsl` (§C6.5)・`-Wreorder-init-list` (§C8.3)。
  - MSVC: `/W4 /w44265 /w44774 /w44062` (§C1.5・§C2.1、enum の switch 網羅)。clang-cl は MSVC 列に従い、clang 専用の警告も `/clang:` で付ける。
  - §C1.3・§C1.5・§C2.1・§C2.13・§C5.1・§C6.5・§C6.6・§C8.3 が挙げる個別のエラー化 (`-Werror=return-type` 等、MSVC の `/we4715` 等) を含め、
    **エラー化は `LUDIARS_CXX_WARNINGS_AS_ERRORS` に従う**。verify preset では ON、add_subdirectory で取り込むホストの既定では OFF。
    (個別の `-Werror=` を常時有効にすると、新しいコンパイラを使うホストのビルドを壊すため。ゲートは verify preset で担保する。)
  - 全警告をエラー化する target はリポごとの「準拠 target 一覧」(= baseline の `ludiars_cxx_mark_warnings_compliant` を付けた target) で管理する。
    新規 target は最初から一覧に載せ、一覧から外すことは禁止 (ラチェット)。
  - 厳しい警告セット (`-Wshadow -Wconversion -Wsign-conversion`) は opt-in (`ludiars_cxx_enable_strict_warnings`。§C2.6 の境界層では必須)。third_party は SYSTEM include にする。
  - 警告フラグを `ludiars_cxx_usage` や PUBLIC / INTERFACE で伝播させることは禁止。
  - 根拠: Praesidium は `-Wall -Wextra -Werror` で解析するのに、製品側の警告設定は `Ergo/CMakeLists.txt:263-267` だけなので、Revisor で初めて落ちる。
  - 担保: [gate — verify preset]
  - 関係: 新規
- **§C4.4 preset と compile_commands — 必須**: CMakePresets.json に Ninja の `ninja-dev` と `verify` を置き、`CMAKE_EXPORT_COMPILE_COMMANDS ON` にする。
  clang-tidy、Praesidium の照合、Anatomia の入力は、この compile_commands.json に限る。Android / iOS を対象に宣言したリポ (Ergo、Pictor) は、
  `android-ndk` / `ios` の configure preset をホスト条件付きで持つ。
  - 根拠: Ergo の preset は vs2022・xcode・ci-packages だけで、VS ジェネレータは compile_commands を出さない。KD-MOB-001 は「モバイルで黙って Vulkan-free に落ちる」事故。
  - 担保: [gate — `cmake --list-presets` の検査]
  - 関係: 新規
- **§C4.5 target ベースの CMake — 必須**: `file(GLOB)` でソースを集めること、ディレクトリスコープの `add_compile_options` / `include_directories` / `link_libraries` は禁止 (baseline は例外)。
  PUBLIC は、公開ヘッダに型やマクロが現れる依存に限る。
  - 根拠: `Ergo/CMakeLists.txt:710` は GLOB なので Praesidium の登録対象を列挙できない。`:150-152` の ergo_log と `:352` の `_USE_MATH_DEFINES` は不要に PUBLIC。手本は `:125` の curl PRIVATE。
  - 担保: [hook + gate — 規則表が GLOB とディレクトリスコープのコマンドを検出、§C3.9 で確認]
  - 関係: RULE_CODE §3 の具体化
- **§C4.6 option の扱い — 必須**: 利用者が明示的に ON にした option の前提が欠けているときは FATAL_ERROR にする。自分の option を `CACHE ... FORCE` で OFF に下げることは禁止。
  - 切り替え先が stub / dummy になる **バックエンド選択** の変数は既定値を持たない。未指定、または SDK が無いときは FATAL_ERROR。
  - 付加機能 (OpenCV がある場合だけ有効になる機能など) に限り三値の `AUTO` を許す。自動で無効になったときは STATUS を出し、公開定義マクロで観測できるようにする。
  - ビルドに含めた GPU target のシェーダ bake は付加機能ではない (§C2.12)。
  - 新規の option は `<PREFIX>_BUILD_*` / `_WITH_*` / `_ENABLE_*`。既存の option は改名しない。既存の `ERGO_AUDIO_BACKEND` は Issue を立てて移行し、ホストの preset にも同時に指定を足す。
  - 根拠: `Ludellus-Native/native/CMakeLists.txt:260,699` は FORCE で OFF にする。`Ergo/CMakeLists.txt:531-553` は dummy に黙って縮退する。手本は `:117-119`。
  - 担保: [hook + gate — CMake、規則表の `CACHE BOOL "" FORCE`]
  - 関係: RULE_CODE §7.1 の具体化
- **§C4.7 公開ヘッダと非公開ヘッダの境界 — 必須**: 他リポに公開してよいのは `include/<proj>/<mod>/` だけ。他リポの `src/` を `target_include_directories` に足すことは禁止。
  必要なときは提供側のリポで公開ヘッダへ昇格させる PR を先に出す。
  - 根拠: `Ludellus-Native/native/CMakeLists.txt:710` は Ergo の非公開ヘッダ `src/bind/ws_client.h` を直接使っている。
  - 担保: [hook + gate — 規則表の `${<Repo>_SOURCE_DIR}/src` と `../<Repo>/src`。gate — §C4.2 と同じ DEFER で自リポ target の INCLUDE_DIRECTORIES を走査する (§C4.2 と同じく、移行期間中は WARNING、移行完了後は FATAL_ERROR。`ludiars_cxx_check_targets` の MODE)]
  - 関係: RULE_CODE §3 の具体化
- **§C4.8 third_party の 2 区分 — 必須**: 同梱してよいのは header-only のライブラリに限り、LICENSE・上流の版・THIRD_PARTY_NOTICES の記載を揃える。
  コンパイルが必要なライブラリは `dependencies.cmake` で SHA かタグを固定して取得する。他リポの third_party やソースツリーをパスで借りること、
  上流の名前を名乗る互換実装や stub を新しく置くことは禁止。既存のもの (Ergo の mini-gtest、Ludellus-Native の httplib stub) は改名と NOTICES の訂正を是正タスクにする。
  - 根拠: `Ludellus-Native/native/CMakeLists.txt:89-100` は Ergo の gtest を、`:983-988` は Pictor の stb を借りている。`:736` は httplib の stub。
  - 担保: [gate — Ergo package hub の STRICT 検査に追加、NOTICES の照合]
  - 関係: RULE_CODE §18 の具体化
- **§C4.9 プラットフォーム分岐 — 必須**: 公開ヘッダに OS 判定マクロや `<windows.h>` 等の OS SDK ヘッダを書くことは禁止。
  - .cpp で OS ごとに分岐するときは対応プラットフォームを列挙し、最後を `#else` + `#error` で終える。中身の無い stub や no-op で黙って縮退しない。
  - 1 つの .cpp にプラットフォーム条件の `#if` が 3 箇所以上あるときは `<name>_win.cpp` / `<name>_posix.cpp` に分割し、CMake でソースを選ぶ。
  - 根拠: 15 ファイルが本体に #ifdef を混ぜている (`Ergo/src/custos/http_server.cpp` に 5 箇所、`Ludellus-Native/native/src/input/mediapipe_hand_source.cpp` に 6 箇所)。分割の手本は `Ludellus-Native/native/src/http/winhttp_client.cpp`。
  - 担保: [hook + gate — 規則表が include/ 内の OS マクロとファイルごとの #if の数を検出。§C4.4 のモバイル configure]
  - 関係: RULE_CODE §7.1 の具体化
- **§C4.10 ヘッダの設定マクロと ODR — 必須**: 公開ヘッダの inline 実装やテンプレート本体を変えるマクロ (ISA の選択、機能のトグル) は、
  CMake の option から、ライブラリ target の PUBLIC `target_compile_definitions` だけで定義する。
  - ヘッダ内の `#ifndef X` / `#define X` による既定値の付与と、TU 単位・consumer 単位の `-D` による上書きは禁止。
  - TU ごとに切り替えたい分岐は .cpp に移すか、inline namespace (`simd_v1` / `scalar_v1`) で別シンボルにする。
  - 設定マクロを持つ公開ヘッダは、設定値を名前に埋めた extern シンボル (例: `ergo_math_simd_cfg_<値>`) を参照する inline 変数を置き、
    ライブラリの .cpp だけがそのシンボルを定義する。MSVC では `#pragma detect_mismatch("ERGO_MATH_SIMD", "<値>")` を併用する
    (inline 関数の本体の違いはリンカが黙って片方を選ぶので、名前の違いでリンクを失敗させる)。
  - 根拠: `Ergo/include/ergo/math/batch.h:11-12` は「-DERGO_MATH_SIMD=0 で scalar を強制」と案内し、:28-34 でヘッダ内に既定値を付与する。`ERGO_MATH_SIMD` に CMake option が無い。add_f32・madd_f32・dot_f32 等は全て inline で本体が #if で切り替わる (:50,71,92,113,173) ので、ホストが一部の TU にだけ -D を付けると同名 inline 関数が 2 種類でき、リンカが黙って片方を選ぶ。
  - 担保: [hook + gate — 規則表が `include/` に追加された `#ifndef X` 直後の `#define X` を検出する (`#pragma once` 前提。インクルードガード風の名前 (`_H` / `_HPP` / `_INCLUDED` 等) は除外。`prefix` を設定したリポでは `<PREFIX>_` のマクロに限り、未設定なら全マクロが対象)。gate — §C3.9 の 2 TU リンク検査 (未定義シンボルか detect_mismatch で失敗することを確かめる)]
  - 関係: RULE_CODE §7.1「設定の一元化」を ODR へ具体化

## C5. 失敗の型と例外の境界

**方針: 回復できる失敗は `[[nodiscard]]` 付きの `Expected` で返し、新しく書く API では例外を失敗の通知に使わない。**
理由: (1) C・JNI・Vulkan・FMOD のコールバック境界を例外が越えると UB か terminate になる。(2) 不正パケットを毎 tick 受ける経路で例外を投げると DoS の入口になる。
(3) 戻り値の破棄はコンパイラで検出できるが、例外の伝播経路は AI に追わせられない。(4) モジュールごとに選ばせると統一されない。
`-fno-exceptions` は、STL や third_party があるので要求しない。

- **§C5.1 Expected で返す — 必須**: 新規・シグネチャを変更する公開 API のうち失敗しうるものは `Expected<T, <Module>Error>` を返す。
  - エラー型は `enum class <Module>Error : std::uint8_t` とし、同じヘッダに `to_string()` を置く。
  - 禁止: bool と out 引数、`std::string* err`、`last_error_`、センチネル値、「もっともらしい値」での失敗通知。
  - `std::optional` は理由の無い「値が無い」を表すときだけ使う。
  - **Expected の実装**: リポに 1 つだけ置く。Ergo とその consumer は ergo_common の **自前の最小実装** `include/ergo/common/expected.h` を使い、`tl::expected` は同梱しない。
    Ergo が依存する下位ライブラリの Pictor (Ergo を取り込むと循環依存になる) は自リポに同じ形の 1 実装を置く。
  - **自前実装は `std::expected` (C++23) の API の部分集合に限る**。std::expected に無いメンバ・関数・暗黙変換を足さない。
    同じテスト TU を C++20 (自前実装) と C++23 (alias) の両方でビルドする契約テスト `test_common_expected` を置く (§C4.1 の `verify` / `verify-cxx23`)。
  - **`std::expected` への alias**: `__cpp_lib_expected` が使える構成では `Expected` を `std::expected` の alias にする。ただし判定は TU ごとに行わず、
    configure 時に baseline の標準で 1 回だけ判定し、ergo_common の PUBLIC 定義 (§C4.10) としてビルド全体に配る。ヘッダは「定義が alias を指すのに
    `__cpp_lib_expected` が無い」場合を `#error` にする。(TU ごとに判定すると、C++20 の TU と C++23 の TU で `Expected` の実体が分かれ、§C4.10 の ODR 違反になるため。)
  - 根拠: 手本は `Ergo/include/ergo/render/render_backend.h:44`。悪い例は `audio/audio_engine.h:41,53`、`io/file.h:24,27`、`math/mat.h:106-110` (特異行列で零行列を返す)。bool と out 引数の組は 131 件、`std::string* err` は 116 件。
  - 担保: [hook + gate — 規則表の `std::string\s*\*\s*\w*err`。gate — Expected を返す関数宣言に `[[nodiscard]]` を必須とする (§C5.4。型への付与は alias モードの `std::expected` では効かないので、関数側で担保する。自前実装の型宣言への `[[nodiscard]]` は C++20 構成向けの補助として残す)。clang-tidy `bugprone-unused-return-value` の `CheckedReturnTypes` に `^::std::expected$` と `^::<repo>::Expected$` を入れる。`-Wunused-result` (MSVC C4834。エラー化は §C4.3)]
  - 関係: RULE_CODE §7 の具体化
- **§C5.2 外部由来の入力のデコードでは例外を投げない — 必須**: ネットワーク・ファイル・設定のパーサの公開入口は `noexcept` にして Expected を返す (§C5.3 の境界に含める)。
  例外を投げうる STL や third_party の呼び出しは、型の分かる例外を型指定の catch で、分からないものを入口の `catch (...)` で受けて Expected に変換する。
  - 根拠: `Ludellus-Native/native/src/world/proto/bytes.h:49` と `datagram.cpp:18,46` は runtime_error を投げる。
  - 担保: [gate — `bugprone-exception-escape` (入口が noexcept なので検出対象になる)、§C3.8 の fuzz_corpus で例外を失敗扱い。memory — REVIEW_VULNERABILITY]
  - 関係: RULE_CODE §9 の具体化
- **§C5.3 noexcept にする境界 — 必須**: 次の関数は必ず `noexcept` にし、内部の例外は最上位で catch してステータスとログに変換する。
  スレッドのエントリ / C API・JNI・Vulkan・FMOD・OS のコールバック / 実行時ロードしたライブラリからのコールバック (§C1.8) / `extern "C"`・JNI の export /
  外部由来入力デコードの公開入口 (§C5.2) / §C1.5 (1)(2) の境界で公開・実装する `I<Name>` の全メンバ関数 (DLL / so の向こう側で呼ばれる側。失敗は Expected で返す) /
  デストラクタ・ムーブ構築・ムーブ代入・swap。コメントに「Never throws」と書くだけで noexcept を付けないことは禁止。
  - `ERGO_HOT` (§C7.1) を兼ねる境界 (オーディオのデバイスコールバックなど) では、catch した例外をログに出さない。`std::atomic` のエラーフラグか
    ロックフリーのキューにエラーコードだけを積み、ERGO_HOT ではないスレッド (制御側の tick など) がそれを読んでログを出す。
    ERGO_HOT の関数本体では例外を投げうる呼び出しをしない (§C7.1 でヒープ確保を禁止しているので、残るのは third_party の呼び出しだけで、
    それは境界の `try` / `catch (...)` 1 か所で受ける)。
  - 根拠: `Ludellus-Native/native/src/world/net/quic/msquic_transport.cpp` は catch が 0 件。Ergo はスレッドを 5 箇所で起動する。`include/ergo/http/client.hpp` はコメントに「Never throws」と書くだけ。
  - 担保: [gate — clang-tidy `bugprone-exception-escape`・`performance-noexcept-move-constructor`・`performance-noexcept-destructor`・`performance-noexcept-swap`]
  - 関係: RULE_CODE §7 の具体化
- **§C5.4 [[nodiscard]] を付ける範囲 — 必須**: Expected やエラー enum を返す関数、リソースを確保してハンドルや所有権を返すファクトリ (`create_*` / `load_*` / `bind`) には
  `[[nodiscard]]` を必須とする。新しいハンドル型は整数の alias にせず、`[[nodiscard]]` 付きの struct で定義する。getter に一律で付けることは求めない (`modernize-use-nodiscard` は使わない)。
  - 根拠: `audio_engine.h` の `load_sound` と `bind.h` の `Handle bind` は、戻り値を捨てると unload / unbind できなくなる。
  - 担保: [gate — `-Wunused-result` (エラー化は §C4.3)、`bugprone-unused-return-value` (CheckedFunctions・CheckedReturnTypes)]
  - 関係: RULE_CODE §10 の具体化
- **§C5.5 外部 API の戻り値はすべて検査する — 必須**: `VkResult` / `HRESULT` を返す呼び出しは検査マクロ (`ERGO_VK_CHECK` 等) で受ける。
  - 根拠: `Ergo/src/render/stage_renderer.cpp:125-129` は vkMapMemory の結果を見ずに memcpy する。未検査の Vulkan 呼び出しが 29 件。
  - 担保: [gate — `bugprone-unused-return-value` の CheckedFunctions に `vkMapMemory` / `vkAllocate*` / `vkQueueSubmit` 等を、`vkCreate*` を正規表現 `^::vkCreate[A-Za-z0-9]*$` (LLVM 19 では各要素が正規表現) で登録し、CheckedReturnTypes に `^::VkResult$` を足す。関数ポインタ (volk / PFN_vk*) 経由の呼び出しと HRESULT は型で拾えないので、検査マクロで受ける]
  - 関係: RULE_CODE §7 の具体化
- **§C5.6 catch(...) を置ける場所 — 必須**: `catch (...)` は §C5.3 の境界 (§C5.2 の入口を含む) にだけ置く。空の catch は RULE_CODE §7 に従う。
  - 根拠: `Ludellus-Native/native/src/app/voice/winrt_voice_listener.cpp:154`。
  - 担保: [gate — `bugprone-empty-catch`]
  - 関係: RULE_CODE §7 を参照
- **§C5.7 Config と検証付きファクトリ — 必須**: 新規モジュールは既定値付きの `Config` を受け取る。メンバに値域や相互制約 (>0、min<=max、非空など) を持つ Config は `static Expected<T, Error> create(const Config&)` だけで
  構築できるようにし、検証の無いコンストラクタを公開しない。`initialize()` が false を返した後に黙って no-op になる二段階初期化は禁止。
  - 根拠: `Ergo/include/ergo/health/health.h` の `max_hp` はコメントに「> 0」とあるだけ。`audio_engine.h` は失敗後に「safe no-ops」になる。
  - 担保: [gate — 不正な Config で create が error を返すことを確かめる契約テスト]
  - 関係: RULE_CODE §9 の具体化
- **§C5.8 Release でも残す契約チェック — 必須**: 状態遷移の API (destroy / free) と信頼境界の前提 (外部由来の値に対する長さ・範囲・状態の前提) は、
  Release でも残る `ERGO_EXPECTS` (fail-fast) で検査する。`ERGO_HOT` の関数と、ERGO_HOT から呼ばれるアクセサは debug assert でよいが、それを通るテストを §C3.7 の sanitizer の下で回す。
  - 根拠: `Ergo/include/ergo/math/pool.h:151` は二重 destroy の検出を assert に頼っており、Release では UAF になる。
  - 担保: [gate — §C3.7]
  - 関係: RULE_CODE §9 の具体化

## C6. 所有権・寿命・並行・永続化

- **§C6.1 所有は型で表す — 必須**: 新規・変更するコードでは、所有目的の生の `new` / `delete` と `malloc` / `free` を禁止し、`make_unique` / `make_shared` を使う。
  pimpl は `std::unique_ptr<Impl>` で持ち、デストラクタを .cpp で定義する。placement new とアロケータの内部だけは理由付きの NOLINT で許す。
  既存の手書き pimpl は、そのクラスを変更する PR で置き換える。
  - 根拠: `Ergo/src/blackboard/blackboard.cpp:50-51`、`bind/bind_engine.cpp:225,232`、`audio/audio_engine_fmod.cpp:44-45`、`world_time/world_time.cpp:114-115`。手本は `math/pool.h:39`。
  - 担保: [hook + gate — `modernize-make-unique`・`modernize-make-shared` (`owning-memory` は GSL 前提なので使わない)、規則表の `new Impl\b|\bdelete\s+impl_`]
  - 関係: RULE_CODE §10 の具体化
- **§C6.2 借用の表し方 — 必須**: 所有しない参照は、null にならないなら `T&`、null を取りうるなら `T*` にし、ヘッダのコメントに「借用であり、寿命は呼び出し側が持つ」と書く。
  呼び出し側のバッファに結果を書き込む関数は `std::span<T>` で受ける。
  - 根拠: 手本は `Ergo/include/ergo/render/frame_composer.h` の `RenderPassDesc::layers`。
  - 担保: [memory — 本文とレビュー]
  - 関係: RULE_CODE §10 の具体化
- **§C6.3 ハンドルと GPU 資源 — 必須**: OS のハンドル (HINTERNET、socket、FILE*、HMODULE) は取得した直後に `UniqueHandle<T, Deleter>` に入れる。
  RULE_CODE §10 の異常系の解放は、Vulkan の資源を複数作る構築関数では scope guard (成功したら dismiss) で実装する。
  フレームをまたいで GPU が参照しうる資源はデストラクタで即座に破棄せず、deletion queue か所有者を通して解放する。
  - 根拠: `Ergo/src/render/stage_renderer.cpp:119-122,213-215` は途中失敗でリークする。RAII の書き方が `src/ui/svg_raster.cpp:19` と `Ludellus-Native/native/src/http/winhttp_client.cpp:21` で別々に作られている。
  - 担保: [gate — 失敗を注入する CTest、Praesidium の `unix.Malloc`]
  - 関係: RULE_CODE §10 の具体化
- **§C6.4 C コールバックへの所有権の受け渡し — 必須**: C API に所有権を渡すときは、`release()` と受け取り側での unique_ptr への再取得を対にしたヘルパ 1 つに閉じ込める。
  ヘルパの外で `.release()` を呼ばない。
  - 根拠: `Ludellus-Native/native/src/world/net/quic/msquic_transport.cpp:22,81,122` は SendBuffer を 2 つの経路でそれぞれ delete している。
  - 担保: [hook + gate — cpp-tidy で `clang-analyzer-cplusplus.NewDelete` / `NewDeleteLeaks`、規則表がヘルパ外の `\.release\(\)` を検出。Praesidium の checker 集合への `cplusplus.*` 追加を Revisor に提案]
  - 関係: RULE_CODE §10 の具体化
- **§C6.5 ビュー型の寿命 — 必須**: `string_view` と `span` をメンバに持てるのは、名前が `*View` で終わる型だけ。
  - 非同期に実行されるラムダ (別スレッド、後で呼ばれるもの、キュー) に、ビュー・参照・イテレータをキャプチャしない。
  - `[this]` / `[&]` をキャプチャしたコールバックを、自オブジェクトの所有物でない登録先 (イベント源、スレッド、キュー、他オブジェクトのメンバ) に
    登録するときは、常に購読解除の RAII (`Subscription`) を受け取ってメンバに持つ。
  - ビューを返す関数には `ERGO_LIFETIMEBOUND` (`[[clang::lifetimebound]]` / `[[msvc::lifetimebound]]`) を付ける。
  - 根拠: 手本は `Ergo/include/ergo/blackboard/blackboard.h:43-49`。§C1.6 で span を導入するので対にする。
  - 担保: [hook + gate — 規則表の `std::(string_view|span<[^>]*>)\s+\w+_\s*[;{=]`。gate — clang の `-Wdangling-gsl` (エラー化は §C4.3)、`bugprone-dangling-handle`、`bugprone-return-const-ref-from-parameter`、§C3.7 の ASan (`detect_stack_use_after_return=1`)]
  - 関係: RULE_CODE §10・§11 の具体化
- **§C6.6 スレッド安全性の宣言 — 必須**: `std::thread` / `std::jthread` / mutex / `std::atomic` をメンバに持つクラスと、他スレッドで実行されるコールバックを登録するクラス (新規・変更するもの) は、ヘッダに
  `Thread-safety: thread-compatible|thread-safe|main-thread-only|<名前>-thread-only` と再入の可否を書く。複数のスレッドから触るメンバは
  `std::atomic` にするか、注釈付きの `ergo::Mutex` (capability 属性付きラッパ) と `ERGO_GUARDED_BY` / `ERGO_REQUIRES` で保護する。注釈の無い共有メンバは禁止。
  - 根拠: `Ergo/src/log/log.cpp:41,49` (log.h は thread-safe と宣言) と `src/sound/audio_engine.cpp:153-154` はロックなしで書き換えるのでデータ競合。
  - 担保: [hook + gate — clang で `-Wthread-safety` (エラー化は §C4.3)、§C3.7 の tsan、LABELS `concurrency` (MSVC ではマクロを空にする)。規則表が `std::(thread|jthread|mutex|atomic)` のメンバを持つヘッダの変更に `Thread-safety:` 行が無い場合を検出。コールバックを登録するクラスはレビュー]
  - 関係: RULE_CODE §11 の具体化
- **§C6.7 グローバル状態とシングルトンを新しく作らない — 必須**: `static T& instance()`、それに委ねる名前空間スコープの便利関数、可変のグローバル状態、関数内の static 状態を
  新しく作らない。依存はコンテキストかコンストラクタで注入する。例外はログの出力先、Release で消えるデバッグツール、プラットフォームの入口 (JavaVM*) に限り、
  直前にコメントマーカー `// <REPO>_ALLOW_GLOBAL: <理由>` (Ergo なら `ERGO_ALLOW_GLOBAL`。マクロではない) を書く。
  - 根拠: `audio_engine.h:32`、`bind.h:33`、`log.cpp` の state()。テスト間で状態が漏れ、DLL ごとに別インスタンスになり、初期化順序も不定になる。手本は `frame_composer.h`。
  - 担保: [hook — マーカーの無い `static\s+[\w:<>]+\s*&\s*instance\s*\(` の追加を block。gate — 同じ規則表で `cpp-build-policy` が fail]
  - 関係: RULE_CODE §16 の具体化
- **§C6.8 永続化の書き込みと読み込み — 必須**:
  - (1) セーブ・設定・成果物の書き込みは共通の `atomic_write_file(path, bytes) -> Expected` だけを使う (RULE_CODE §10 の回転方式のファイル版)。
    同じディレクトリの tmp に書き、flush と fsync (Windows は `FlushFileBuffers`) をしてから rename (Windows は `ReplaceFileW` か
    `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`) で置き換える。rename の前に `remove_all` などで正本を消さない。
  - (2) 永続形式は magic か `version` を持つ。読む側は古い版を明示的な移行関数で受け入れ、新しすぎる版と壊れた版はエラーにする。
  - (3) 読めなかったファイルは `.broken` に退避し、既定値で上書き保存しない。
  - (4) ホットリロードは RULE_CODE §10 の回転方式に従い、書きかけのファイルを読まない ((1) で書かれたものだけを読む)。
  - 根拠: `Ludellus-Native/native/src/personal/artifact_store.cpp:49-50` は `fs::remove_all(dir)` → `fs::rename(partial, dir)` の間にクラッシュすると成果物が消える。`Ergo/src/scene/scene.cpp:140-145` は trunc で直書き、`:324` は version=1 を書くが読む側は検査しない。`Ergo/src/tela_graph/writer.cpp:146-160` と `player_link.cpp:68-85` は tmp+rename を別々に実装し fsync が無い。`player_link.cpp:44-45,90-95` は版不一致を `PlayerLink{}` に化けさせて次の保存で上書きする。`app/hot_file.h:30-40` は書きかけでも読む。手本は `riddle_progress_store.cpp:60-73` の `.broken` 退避。
  - 担保: [hook + gate — 版ごとの `tests/<module>/fixtures/v<N>/` を読む後方互換 CTest (`version` を上げる PR は新しい fixture を必須)、失敗注入 CTest (rename 失敗、途中で切れたファイル、新しすぎる版) で正本が残ることと `.broken` 退避を確認、規則表が io helper 外の `ofstream.*trunc` と rename 直前の `remove_all\(` を検出]
  - 関係: RULE_CODE §7.1・§10、RULE_TEST §2 (セーブ後方互換) を書く側から具体化

## C7. リアルタイム処理と決定性

- **§C7.1 ホットパスの禁止事項 — 必須**: `ERGO_HOT` (共通マクロ) を付けた関数では、ヒープ確保 (コンテナの構築・resize、std::function の代入を含む)、mutex の取得、
  ファイル I/O、ログを禁止し、関数を `noexcept` にする。
  - オーディオデバイスのコールバックとミキサ、新しく作るレンダーレイヤーの `record` には `ERGO_HOT` を必須とする。
  - 作業バッファは初期化時に確保する。スレッド間の受け渡しはロックフリーのリングバッファかダブルバッファで行う。
  - render スレッドのそれ以外の部分は RULE_TEST §2 の frame budget に任せる。
  - 根拠: `Ergo/src/sound/audio_engine.cpp:197-204` の mixVoices は毎周期 mutex を取り、vector を確保し、ロックを持ったまま `audio_decoder.cpp:148` のファイル read を呼ぶ。
  - (推奨) clang 20 以降のホストでは `[[clang::nonblocking]]` と `-Wfunction-effects` を併用する (ゲート外)。
  - 担保: [gate — global `operator new` を差し替えて確保回数を数える CTest (ウォームアップ 10 回の後、100 回実行して確保の増分が 0)]
  - 関係: RULE_CODE §11 への追加
- **§C7.2 ロジック層の乱数 — 必須**: ロジック層では共通の決定的な RNG (固定アルゴリズムと整数の範囲写像を持つ。Ludellus-Native の `GenRng` を ergo_common に昇格させる) を使い、seed は外から注入する。
  - ロジック層では `std::*_distribution` と `std::random_device` を禁止する。ロジック層以外では標準の分布を使ってよいが、seed は注入できるようにする。
  - `this` のアドレスや時刻から seed を作ることは全層で禁止。`random_device` は暗号用途・nonce と、「0 = 自動」と明記した Config の場合だけ使える。
  - 根拠: 分布クラスの実装は MSVC / libc++ / libstdc++ で異なるので、Ludellus-Native の world 層の 31 箇所で盤面がプラットフォームごとに変わる (`game_variation.cpp:8`)。`Ergo/src/particle/particle_system.cpp:14` は this のアドレスを seed にしている。
  - 担保: [hook + gate — ロジック層に限った規則表の `_distribution<|random_device`、§C3.11 のゴールデン照合。`cert-msc32-c` / `cert-msc51-cpp` は固定 seed を違反と判定するので使わない]
  - 関係: RULE_CODE §16 の具体化
- **§C7.3 ロジック層の時刻 — 必須**: RULE_CODE §16 の時刻の注入を、ロジック層では `*_clock::now()` の直接呼び出し禁止として具体化する
  (dt 引数か時計の interface で受ける)。
  - 根拠: `Ludellus-Native/native/src/app/online_runtime.cpp:30`。
  - 担保: [hook + gate — ロジック層に限った規則表の `_clock::now\(` (対象を絞るので profile や log の誤検知は出ない)]
  - 関係: RULE_CODE §16 の具体化
- **§C7.4 浮動小数の決定性 — 必須**:
  - (1) `ludiars_cxx_usage` (§C4.2) で clang / gcc に `-ffp-contract=off`、MSVC に `/fp:precise` を付ける (`/fp:contract` は付けない)。inline ヘッダの演算を consumer の TU でも揃えるため PUBLIC で伝播させる。
    ロジック層の target では `-ffast-math`・`-Ofast`・`/fp:fast` を禁止する。
  - (2) ロジック層では `std::sin/cos/tan/atan2/pow/exp/log` などの libm 超越関数を直接呼ばず、ergo_common の決定的な実装 (多項式近似の自前実装。§C3.11 のゴールデンで固定) を通す。
  - (3) SIMD の高速経路は、公開ヘッダで「bit 一致」か「近似」のどちらかを宣言する。bit 一致と宣言したものは scalar と同じ評価順序で実装し、水平加算でリダクションの順序を変えない。
  - (4) 乱数から整数の範囲への写像を浮動小数経由で行わない。整数の API で行う。
  - 根拠: `Ergo/include/ergo/math/batch.h:14` は「SSE2 の結果は scalar と bit 一致」と宣言するが、:110-133 の dot_f32 は 4 レーンで累積してから水平加算するので順序が違う。Ergo と Ludellus-Native の CMake には `ffp-contract`・`/fp:`・`ffast-math` の指定が 0 件で、arm64 clang の既定 (fp-contract=on) では :100 の `a[i] += s * b[i]` が fmadd に縮約され x64 と結果が分かれる。`Ludellus-Native/native/src/world/scene/enemy_remap.cpp` は world 層で std::sin 等を 6 回呼ぶ。`src/suika/game.h:33-38` の next_f は 1.0 を返しうるので next_int(max) が max を返す off-by-one がある。
  - 担保: [hook + gate — configure でロジック層 target のフラグに fast-math 系があれば FATAL、規則表がロジック層の `std::(sin|cos|tan|atan2|pow|exp|log)\(` を検出、§C3.11 の SIMD / scalar `memcmp` と bit 一致のゴールデン照合]
  - 関係: RULE_CODE §16 を浮動小数へ具体化

## C8. API の形・命名・依存の衛生

- **§C8.1 命名 — 必須**: 新しく追加する識別子とファイルは次に従う。既存の公開名とファイル名は、モジュール単位で移行する Issue なしには改名しない。
  - 名前空間は `<repo>::<module>`。target `<repo>_<module>` と `include/<repo>/<module>/` に一致させる。
  - 型・concept・enum の値は PascalCase、関数と変数は snake_case、private メンバは末尾 `_`、interface は前に `I`。
  - constexpr 定数は `k` + PascalCase に一本化する (UPPER_SNAKE は使わない)。マクロは §C8.2。
  - ヘッダは `.h` と `#pragma once`。get / set の接頭辞は禁止しない (既存の `set_*` が 57 件)。
  - 根拠: `Ergo/include/ergo/sound/` は camelCase (`setVolume`)、`audio/` は snake_case で混在。定数は k が 15 件、UPPER が 8 件。`.hpp` が 1 件。
  - 担保: [gate — `readability-identifier-naming` を clang-tidy-diff で変更行に適用。memory — interface の `I` 接頭辞はレビュー (機械検査しない)]
  - 関係: RULE_CODE §4 の具体化
- **§C8.2 名前空間とマクロの衛生 — 必須**: ヘッダではどのスコープでも `using namespace` を禁止する。ヘッダ内の実装詳細は `::detail` に置く。
  新しいマクロは `<REPO>_<MODULE>_UPPER_SNAKE` を必須とする。例外は common モジュールが定義し、下の **共通マクロ表** に列挙したものだけで、`<REPO>_` 直下を許す。
  既存の `BIND_VAR` / `BIND_FN` は互換 alias を付けて Issue で移行する。
  - 根拠: `Ergo/include/ergo/bind/bind.h` のマクロはホストのマクロと衝突しうる。共通マクロにまで MODULE を要求すると、本規約自身が導入するマクロが gate で落ちる。
  - 担保: [hook + gate — `google-global-names-in-headers`、`cppcoreguidelines-macro-usage` (AllowedRegexp は `^<REPO>_<MODULE>_` と共通マクロ表から生成)、規則表のヘッダ内 `using namespace`]
  - 関係: RULE_CODE §3 の具体化

  | 共通マクロ (Ergo) | 用途 | 規約 |
  |------------------|------|------|
  | `ERGO_HOT` | ホットパスの宣言 | §C7.1 |
  | `ERGO_EXPECTS` | Release でも残る契約チェック | §C5.8 |
  | `ERGO_GUARDED_BY` / `ERGO_REQUIRES` | スレッド安全性注釈 | §C6.6 |
  | `ERGO_CAPABILITY` / `ERGO_ACQUIRE` / `ERGO_RELEASE` | 注釈付き `ergo::Mutex` の実装に必要な capability 注釈 | §C6.6 |
  | `ERGO_VK_CHECK` | VkResult の検査 | §C5.5 |
  | `ERGO_LIFETIMEBOUND` | ビューを返す関数の寿命注釈 | §C6.5 |
  | `ERGO_LOG_*` | 共有ロガー | §C8.4 |
- **§C8.3 Config / Desc 構造体 — 必須**: 新規・変更する `*Config` / `*Desc` / `*Info` は、コンストラクタと private メンバを持たない集約にし、全メンバに既定値を書く (検証は §C5.7)。
  指示付き初期化子で構築し、2 要素以上を位置だけで集約初期化することは禁止。
  - 根拠: Ergo の公開 API は Config とクラスの組を基本にしている (`score.h:18`、`input/types.h:97`)。`custos_module.h:18` はすでに `{ .port = 5198 }` を推奨。メンバを追加すると位置で初期化した値が黙ってずれる。
  - 担保: [hook + gate — 規則表の `(Config|Desc|Info)\s*\{\s*[^.}\s]`。gate — clang の `-Wreorder-init-list` (エラー化は §C4.3。MSVC は C7560 が常にエラー)]
  - 関係: RULE_CODE §6 の具体化
- **§C8.4 ログ — 必須**: リポごとに共有ロガーを 1 つ指定する。Ergo とそれを取り込むリポは `ERGO_LOG_*`、Pictor のような下位のリポは自前の 1 つを持つ。
  - ライブラリのコードで `std::cout` / `std::cerr`、`printf`、`fprintf(stderr|stdout)` を直接書かない。CLI・demo・tools・tests の main と、ロガーの実装 1 ファイルは例外。
  - ロガーは Android では logcat に出力する。printf 形式のエントリには format 属性を付ける (MSVC の C4774 は §C2.1)。`ERGO_HOT` の関数からはログを呼ばない。
  - 根拠: `Ergo/src/render/stage_renderer.cpp:79,223`、`src/particle/renderer.cpp:191`、`Ludellus-Native/native/src/identity/cernere_ws_adapter.cpp:47-155`。Android では stderr の出力が消える。`log.h:44` に format 属性が無い。
  - 担保: [hook + gate — 規則表がロガー経路を宣言したリポに限って直接出力を検出、`-Wformat=2`]
  - 関係: RULE_CODE §15 の「Vestigium 経由」を、C++ では共有ロガー (`ERGO_LOG_*`) 経由に読み替える。Vestigium への転送が必要な場合は、ロガーの実装 1 ファイルに閉じる
- **§C8.5 公開ヘッダを最小にする — 必須**: 公開ヘッダで Vulkan・FMOD・curl・windows などの third_party / OS ヘッダを新たに直接 include しない。
  `vk_fwd.h` のような前方宣言ヘッダか pimpl で隠す。Vulkan を公開 API とするリポ (Pictor) は許可リストに載せる。
  - 根拠: 手本は `Ergo/include/ergo/render/vk_fwd.h` と `audio_engine.h`。`particle/renderer.h:15` は Vulkan を直接 include している。
  - 担保: [hook + gate — 規則表が `include/` 追加行の SDK ヘッダ (`vulkan` / `vk_mem_alloc` / `volk` / `fmod` / `curl` / `windows` / `winsock2` / `d3d12` / `dxgi` / `jni` など。正確なパターンは規則表を正とする) の include を、`cpp-rules.json` の `publicIncludeAllow` を除いて検出。gate — §C3.6 の header set]
  - 関係: RULE_TEST §2 (consumer のリンク) の前提
- **§C8.6 定数 — 必須**: 数学定数は `std::numbers`、ビット演算は `<bit>` を使う。`#define M_PI` のようなマクロ定数は禁止。
  - 根拠: `Ergo/src/physics2d/body.cpp:5-6`。
  - 担保: [gate — `modernize-use-std-numbers`]
  - 関係: RULE_CODE §6 の具体化

## C9. 機械担保と運用

- **§C9.1 正本の書式 — 必須**: 本書の各 §C は「規約文」「根拠」「担保 (memory / hook / gate と手段)」「関係 (具体化元の RULE_CODE §N。無ければ新規)」を持つ。
  REVIEW の対応先は「担保マトリクス」の REVIEW 列で 1 つ以上示し、対応先の REVIEW にはその規約を確かめる C++ 項目を置く。
  RULE_CODE の「運用」の「言語別 RULE」の行から本書を指す。
  - 根拠: HARNESS.md「ハーネスの原則」。
  - 担保: [gate (未実装。「未実装の担保」) — `AIFormat/scripts/check-rule-ids.mjs` を `harness-check.mjs` から呼び、ID の重複、参照する §N の実在、REVIEW との対応、規則表の各規則が実在する §C を指すことを検査する。実装されるまでは memory]
  - 関係: RULE_CODE「運用」の拡張
- **§C9.2 スキルと委託 — 必須**: Castra の `cpp-conventions` スキルに本書の同期コピーを置く。coding-conventions には「C++ / CMake は cpp-conventions も参照」の 1 行だけを足す。
  リポの CLAUDE.md には上書き内容だけを書く。C++ の委託用 delegation template には本書のパスと §C3.4 の gate のコマンドを固定文で入れる。
  Codex にはフックが効かないので、hook で担保する規則は必ず §C9.5 の規則表を通して `cpp-build-policy` gate にも載せ、hook だけの規則を作らない (例外は §C9.5 (a) の要点表示だけ)。
  `cpp-conventions` スキルは `*.h` / `*.hpp` / `*.cpp` / `CMakeLists.txt` / `*.cmake` / `CMakePresets.json` / `shaders/*` を編集するときに読み込まれるよう、
  description にこれらの拡張子とパスを書く。
  - 根拠: HARNESS §2.0、`Castra/.claude/delegation-templates/`。
  - 担保: [memory — スキルと委託 template。同期のずれを見つける §C9.1 の検査は未実装]
  - 関係: RULE_CODE「運用」の具体化
- **§C9.3 ツール設定の正本と版の固定 — 必須**: `.clang-format` / `.clang-tidy` / `.editorconfig` は [`cpp/`](./cpp/) からコピーし、先頭に正本の版を書く。
  - リポ側で上書きできるのは末尾のキーと CheckOptions の追記だけ。third_party には `DisableFormat: true` を置く。
  - clang-format と clang-tidy は **LLVM 19 に固定** する。正本の check と option は、LLVM 19 の `clang-tidy --verify-config` が
    `No config errors detected.` だけを出すものに限る。LLVM 20 で入る名前と option は、版を上げる PR で入れる。
  - 整形の検査は `git clang-format --diff <merge-base>` で行い、終了コードではなく出力の有無で判定する。clang-tidy は clang-tidy-diff で変更行に限定する。
  - 有効にする check は正本に名前で列挙する (`clang-analyzer-optin.taint.*` と `clang-analyzer-cplusplus.*` を含む)。グループのワイルドカードは、除外する check の一覧を付けた場合だけ許す。
  - 根拠: Ergo と Ludellus-Native にはこれらの設定ファイルが無い。`modernize-use-constraints` (17 以上)、`bugprone-return-const-ref-from-parameter` と optin.taint の TaintedAlloc (19 以上) を使うため。
  - 担保: [gate — `cpp-format`、`cpp-tidy`]
  - 関係: 新規
- **§C9.4 抑制の作法 — 必須**: 抑制は `// NOLINT(<check>): <理由> (§Cn)` と同じ形式の `NOLINTNEXTLINE` / `NOLINTBEGIN` に限り、`NOLINTEND` は
  `(<check>)` だけを書く。チェック名や理由の無い NOLINT は禁止。規則表の finding を抑制するときの check 名は `cpp-rules-<§C 番号>` (例: `cpp-rules-C2.5`)。
  `#pragma warning(disable)` と `diagnostic ignored` は直前の行に同じ形式で理由を書き、push / pop で範囲を閉じる。Praesidium の禁止 API と analyzer の警告は抑制せずにコードを直す。
  - 根拠: Praesidium は抑制を持たない設計 (RV-PRAESIDIUM-01)。Ergo の NOLINT は 0 件なので、今のうちに作法を決められる。
  - 担保: [hook + gate — 規則表 (`check-cpp-suppressions` を統合) が変更行を検査]
  - 関係: RULE_CODE §7 の具体化
- **§C9.5 規則表と PostToolUse フック — 必須**: 正規表現による検査は `cpp/rules/cpp-rules.mjs` 1 つにまとめる。各規則は §C 番号・対象パス・重大度 (warn / error。error は hook で block する) を持ち、2 つの経路が同じ表を使う。
  - (1) hook: C++ / CMake / シェーダを Edit / Write したとき `Castra/.claude/hooks/cpp-convention-check.mjs` が動く。3 秒以内に終わり、error の規則以外では操作を止めない。
    (a) セッションとリポの組ごとに最初の 1 回だけ要点を表示する / (b) 編集したファイル 1 本に `Revisor/src/praesidium/rules.mjs` の `sourceFindings` を適用する / (c) 規則表を追加行に適用する。
    rules.mjs を解決できないときは「Praesidium tripwire 未実行」と 1 行出し、黙って何もしない状態にしない。
  - (2) gate: `cpp-build-policy` が merge-base の diff に規則表を適用し、warn 以上を fail にする。
  - clang-tidy はフックに入れない (3 秒に収まらないため)。
  - リポ単位の規則の無効化は、`cpp-rules.json` の `disable` に §C 番号か規則名と理由を書く。`suppressible: false` の規則 (§C1.7、§C1.8 の `load-library`、
    §C2.1、§C2.2、§C6.7、§C9.4) と、それを含む §C 番号は無効にできず、書くと規則表が例外で止まる (§C9.4)。
  - 根拠: 既存の `code-convention-check.mjs` は .cpp / .h を対象にしているが行数しか見ない。Codex への委託では hook が効かない (§C9.2)。
  - 担保: [hook + gate]
  - 関係: RULE_CODE「運用」の harness 層
- **§C9.6 変更範囲の原則 — 必須**: format / tidy / build-policy の gate は merge-base からの変更集合だけに適用する。変更集合とは、変更行、変更 TU、
  変更ヘッダを include している TU (`clang -MM` で展開) を指す。merge-base が取れないときは全域検査に切り替えず、理由を出して fail にする。適用の詳細は「既存コードへの適用方針」。
  - 根拠: Praesidium は全域を要求すると Figmentum の 464 本や Pictor の 288 本が通らないため、変更範囲に限定した。
  - 担保: [gate — `cpp/rules/lib/git-diff.mjs` (変更行と変更ファイル。merge-base が取れなければ fail)。ヘッダを include する TU への展開 (`clang -MM`) は `cpp-changed-units.mjs` で行う (未実装。「未実装の担保」)]
  - 関係: RV-PRAESIDIUM-03 と揃える

---

## 担保マトリクス

- **記憶** = 本書と cpp-conventions スキル。**規則表** = §C9.5 の `cpp-rules.mjs` を hook と `cpp-build-policy` の両方で適用。「—」は該当なし。
- **REVIEW** 列の略号: CQ = `common/REVIEW_CODE_QUALITY.md` / VU = `common/REVIEW_VULNERABILITY.md` / VL = `local-app/REVIEW_VULNERABILITY_LOCAL.md` /
  DS = `common/REVIEW_DESIGN.md` / QA = `common/REVIEW_QUALITY.md` / H = harness 自体の検査 (REVIEW 行を持たない)。
- memory だけで担保する規約は §C6.2。`check-rule-ids.mjs` が実装されるまでは §C2.11・§C9.1・§C9.2 も実質 memory だけ (「未実装の担保」)。
- Revisor への提案 (§C1.8 / §C2.1 / §C2.3 / §C2.10 / §C6.4) と「未実装の担保」は、実装されるまで担保に数えない。`[[clang::nonblocking]]` は推奨でゲート外。

| 規約 | 記憶 | フック | ゲート | REVIEW |
|---|---|---|---|---|
| C1.1 | 本文 | 規則表 (無制約 template) | 規則表 | CQ |
| C1.2 | 本文 | 規則表 (`enable_if\|void_t`) | modernize-use-constraints、規則表 | CQ |
| C1.3 | 本文 | — | -Wreturn-type (エラー化 §C4.3)、否定 static_assert | CQ |
| C1.4 | 本文 | 規則表 (concepts.h 以外の concept) | 規則表、Anatomia membership | CQ |
| C1.5 | 判定表 | 規則表 (I<Name> のメンバ) | 規則表、virtual-class-destructor、special-member-functions、-Wnon-virtual-dtor | DS |
| C1.6 | 本文 | 規則表 ((ptr,size)・vector 引数) | 規則表 (公開ヘッダ) | VU |
| C1.7 | 採否表 | 規則表 (modules・co_*) | SCAN_FOR_MODULES OFF、規則表 | CQ |
| C1.8 | 本文 | 規則表 (LoadLibrary) | 規則表、`<lib>_abi.h` static_assert | VL |
| C2.1 | 本文 | rules.mjs、規則表 | 規則表、-Wformat=2、unsafe-functions (既定・More)、cert-err34-c、cert-msc50-cpp、cert-err33-c | VU |
| C2.2 | 本文 | 規則表 (`std::sto*`) | cert-err34-c、規則表 | VU |
| C2.3 | 本文 | — | optin.taint.TaintedAlloc、コーパス再生 CTest、Praesidium native | VU |
| C2.4 | 本文 | 規則表 | 規則表、reflection CTest | VU |
| C2.5 | 本文 | 規則表 (注釈なし reinterpret_cast) | 規則表、pro-type-reinterpret-cast、casting-through-void、UBSan alignment | VU |
| C2.6 | 本文 | 規則表 (C スタイル・関数形式キャスト、`.size()` の狭化) | 規則表、cstyle-cast、readability-casting、境界層の strict warnings、implicit-integer-truncation | VU |
| C2.7 | 本文 | — | -Wsign-compare、UBSan、境界層の unsigned-integer-overflow | VU |
| C2.8 | 本文 | — | init-variables、pro-type-member-init、trivial-auto-var-init | VU |
| C2.9 | 本文 | — | debug / sanitizer preset の hardening | VU |
| C2.10 | 本文 | — | RV-PRAESIDIUM-03、praesidium-config-sync CTest | VU |
| C2.11 | REVIEW | — | — (check-rule-ids は未実装) | VU |
| C2.12 | 本文 | 規則表 (shaders 変更でレイアウトテスト欠落) | 規則表 (変更集合)、shader_layout CTest、glslc / spirv-cross 無しで FATAL | CQ |
| C2.13 | 本文 | 規則表 (u8path・変換 API) | 規則表、deprecated-declarations、cert-err33-c、日本語パス往復 CTest | CQ |
| C3.1 | 罠一覧 | 規則表 | 規則表 | QA |
| C3.2 | 本文 | 規則表 (tests の `int main(`) | ergo_add_test、規則表 | QA |
| C3.3 | 本文 | — | CMake FATAL、`--no-tests=error` | QA |
| C3.4 | 本文 | — | Revisor 登録テスト 4 件 (+ ctest-asan-ubsan) | QA |
| C3.5 | 本文 | 規則表 (テスト欠落) | static_assert、規則表 | QA |
| C3.6 | 本文 | — | VERIFY_INTERFACE_HEADER_SETS | QA |
| C3.7 | 本文 | — | asan-ubsan / tsan preset、Revisor 登録 | QA |
| C3.8 | 本文 | 規則表 (ハーネス欠落) | fuzz_corpus CTest (例外も失敗) | QA |
| C3.9 | 本文 | — | `ctest --build-and-test`、2 TU の ODR 検査 | QA |
| C3.10 | 本文 | — | preset でバックエンド明示、LABELS gpu | QA |
| C3.11 | 本文 | — | bit 一致ゴールデン、SIMD / scalar memcmp | QA |
| C3.12 | 本文 | 規則表 (augur.contracts.json の C/C++) | 規則表 (cpp-build-policy) | QA |
| C4.1 | 本文 | 規則表 (`CXX_STANDARD`) | CMake configure、規則表、verify / verify-cxx23 | CQ |
| C4.2 | 本文 | 規則表 (target 個別 `/utf-8`・ソース内 NOMINMAX・`_USE_MATH_DEFINES` の配布) | 規則表、baseline リンク検査 (DEFER) | CQ |
| C4.3 | 本文 | — | verify preset の警告エラー化 | CQ |
| C4.4 | 本文 | — | `cmake --list-presets` 検査 | CQ |
| C4.5 | 本文 | 規則表 (GLOB・ディレクトリスコープ) | 規則表、consumer リンクテスト | CQ |
| C4.6 | 本文 | 規則表 (`CACHE BOOL "" FORCE`) | CMake FATAL、規則表 | CQ |
| C4.7 | 本文 | 規則表 (他リポの /src) | 規則表、DEFER の INCLUDE_DIRECTORIES 走査 (MODE に従う) | CQ |
| C4.8 | 本文 | — | package hub STRICT、NOTICES 照合 | VU |
| C4.9 | 本文 | 規則表 (OS マクロ・#if 数) | 規則表、android-ndk / ios configure | CQ |
| C4.10 | 本文 | 規則表 (ヘッダ内既定値マクロ) | 規則表、2 TU リンク検査 (設定値シンボル・detect_mismatch) | CQ |
| C5.1 | 本文・方針 | 規則表 (`std::string* err`) | 関数宣言の [[nodiscard]]、unused-return-value (CheckedReturnTypes)、-Wunused-result、test_common_expected、規則表 | CQ |
| C5.2 | 本文 | — | exception-escape、fuzz_corpus | VU |
| C5.3 | 本文 | — | exception-escape、noexcept-move / destructor / swap | CQ |
| C5.4 | 本文 | — | unused-result、unused-return-value | CQ |
| C5.5 | 本文 | — | unused-return-value (CheckedFunctions・CheckedReturnTypes) | CQ |
| C5.6 | §7 参照 | — | bugprone-empty-catch | CQ |
| C5.7 | 本文 | — | 契約テスト CTest | CQ |
| C5.8 | 本文 | — | asan-ubsan preset | VU |
| C6.1 | 本文 | 規則表 (`new Impl`・`delete impl_`) | make-unique / make-shared、規則表 | CQ |
| C6.2 | 本文 | — | — | CQ |
| C6.3 | 本文 | — | 失敗注入 CTest、unix.Malloc | CQ |
| C6.4 | 本文 | 規則表 (ヘルパ外 `.release()`) | cplusplus.NewDelete*、規則表 | VU |
| C6.5 | 本文 | 規則表 (view 型メンバ) | dangling-gsl、dangling-handle、ASan、規則表 | VU |
| C6.6 | 本文 | 規則表 (Thread-safety 行欠落) | -Wthread-safety、tsan、規則表 | CQ |
| C6.7 | 本文 | 規則表 (instance() を block) | 規則表 | DS |
| C6.8 | 本文 | 規則表 (trunc 直書き・remove_all) | 後方互換 fixture、失敗注入 CTest、規則表 | QA |
| C7.1 | 本文 | — | 確保回数 CTest | CQ |
| C7.2 | 本文 (対象層の宣言) | 規則表 | 規則表 (ロジック層)、ゴールデン照合 | QA |
| C7.3 | 本文 | 規則表 | 規則表 (ロジック層の `now()`) | QA |
| C7.4 | 本文 | 規則表 (ロジック層の libm) | fp フラグ configure 検査、規則表、memcmp、ゴールデン照合 | QA |
| C8.1 | 本文 (I 接頭辞はレビュー) | — | readability-identifier-naming (変更行) | CQ |
| C8.2 | 共通マクロ表 | 規則表 (ヘッダの `using namespace`) | global-names-in-headers、macro-usage、規則表 | CQ |
| C8.3 | 本文 | 規則表 (位置初期化) | reorder-init-list、規則表 | CQ |
| C8.4 | 本文 | 規則表 (宣言したリポのみ) | 規則表、-Wformat=2 | CQ |
| C8.5 | 本文 | 規則表 (third_party の include) | 規則表 (許可リスト)、§C3.6 | DS |
| C8.6 | 本文 | — | modernize-use-std-numbers | CQ |
| C9.1 | 本文 | — | — (check-rule-ids.mjs は未実装) | H |
| C9.2 | スキル・委託 template | — | — (check-rule-ids.mjs は未実装) | H |
| C9.3 | 本文 | — | cpp-format、cpp-tidy | H |
| C9.4 | 本文 | 規則表 (NOLINT の形式) | 規則表 | CQ |
| C9.5 | — | cpp-convention-check.mjs | cpp-build-policy (disable は抑制できる規則だけ) | H |
| C9.6 | 本文 | — | git-diff.mjs (変更行・変更ファイル。TU への展開は未実装) | H |

---

## 既存コードへの適用方針

- **原則は変更範囲だけに適用する** (§C9.6、Praesidium と同じ方針)。
  - gate を適用するのは変更行・変更 TU・変更ヘッダを include する TU に限り、既存コードへは遡らない。
  - 既存ファイルを変更するときは、変更した宣言・関数・行に §C を適用する。ファイルに 1 行触れたことを理由にファイル全体の是正は求めない。
- **新規 target** (main の target 一覧との差分で判定) は全 §C に準拠させる。
- **C++20 化前の免除**: 下の手順 3 が終わっていないリポで追加する新規ファイルに限り、標準の引き上げを要する §C を免除する。
  対象は C++20 の言語・ライブラリ機能を要する部分に限る: §C1.1〜§C1.4・§C3.5 (concept / requires。代わりに static_assert で契約を書く)、
  §C1.6 の span (string_view は C++17 で使えるので対象外)、§C2.4 の std::endian、§C2.5 の bit_cast (static_assert と memcpy で代替)、§C2.7 の std::cmp_*、
  §C2.13 の char8_t 経由の変換、§C8.3 の指示付き初期化子、§C8.6 の std::numbers / `<bit>`。
  手順 3 が終わった時点で免除は消える (`ludiars_cxx_usage` をリンクした target はすべて C++20 以上になるため)。Ludellus-Native は既に C++20 なので対象外。
- **一括移行は機械的な変更だけを含む専用 PR に限り、ロジックの変更を混ぜない。**
  1. 全体を再整形し、`.git-blame-ignore-revs` を更新する。
  2. `ludiars_cxx_warnings` のリンクへ移行する。target ごとに警告をゼロにし「準拠 target 一覧」に追加する (ラチェット)。
  3. `ludiars_cxx_usage` を導入し、C++20 へ引き上げる。
- **Ergo の C++17 → C++20 化は決定済みで、単独の PR で行う** (C++23 の選択は §C4.1 の条件で別途判断する)。
  - 内容: トップの `CMAKE_CXX_STANDARD 17` を削除し全 target に `ludiars_cxx_usage` を PUBLIC でリンク / 686・715・1051・1099 行の個別指定と target 個別の `/utf-8`
    (`ergo_render` の PUBLIC /utf-8 を含む) を削除 / u8path の 25 件を §C2.13 の `path_from_utf8` へ置換 (deprecated が verify でエラーになるため同じ PR の機械的変更とする) /
    `cmake_minimum_required` を 3.24 へ上げる (§C3.6)。
  - 確認: Ergo の全 CTest、Ludellus-Native の native ビルドと ctest、AdventureCube と KuzuSurvivors のリンク (ホスト側 pin 更新 PR の登録テスト)。
    `-ffp-contract=off` がホストへ伝播することを PR 本文に明記する。u8 リテラルは 0 件なので char8_t による破壊は小さい。
- **Ergo の `.github/workflows/ci.yml` は削除と決定済み** (RULE_TEST §1)。削除前に、全ジョブを Revisor 登録テストへ移す。
  - (a) `build-and-test` (windows-latest の MSVC Release + ctest) は §C3.4 の `ctest` に移す。`ERGO_AUDIO_BACKEND=dummy` は §C3.10 に従い verify preset で明示指定する。
  - (b) `unity-package-core` (`dotnet test tests/unity_packages/Ergo.Packages.Core.Tests.csproj`) は C++ 以外のテストだが、`unity-package-core` [code, test] として別に登録する。
  - 登録して読み戻したことを確認してから ci.yml を削除する。ci.yml に sanitizer の構成は無いので、§C3.7 の `asan-ubsan` preset と `ctest-asan-ubsan` は新しく作る。
    AIFormat が配信する `harness.yml` は残す (§C3.4)。Ergo 側の実作業は別 PR で行う。
- **推奨する順序**:
  1. AIFormat に本書、`cpp/` のツール設定、規則表を置く。RULE_CODE の「運用」と §17 から本書を参照する。
     §C9.1 の `scripts/check-rule-ids.mjs` を作り、`harness-check.mjs` から呼ぶ。
  2. Ergo に preset、`ludiars_cxx_warnings`、compile_commands を入れる (標準と動作は変えない)。
  3. `ludiars_cxx_usage` を入れて C++20 に引き上げる。
  4. `ergo/common` に共通部品を置く: `expected.h` (自前最小実装 + alias 判定)、`ByteReader` / `take_bytes`、`narrow`、`UniqueHandle`、注釈付き `Mutex`、共通マクロ、
     決定的 RNG と決定的 libm (多項式近似)、`parse_double`、`path_from_utf8` / `widen` / `narrow_utf8`、`atomic_write_file`。
  5. Ergo に `praesidium.json` を置き、Revisor へ登録テストを登録し、`ci.yml` を削除する。
  6. 是正 Issue を消化する。
- **既に分かっている違反は是正 Issue として登録する** (規約で一括修正は求めない)。
  - Ergo: `sound/audio_engine.cpp` の mixVoices と setOutputCallback / `render/stage_renderer.cpp` の途中失敗時リークと vkMapMemory 未検査 /
    `custos/http_server.cpp` の Content-Length / `sound/audio_decoder.cpp` の seekg と struct への直接 read / `math/pool.h` の destroy /
    `log/log.cpp` のデータ競合 / `math/vec.h` の z() / `particle/particle_system.cpp` の seed / `math/batch.h` の bit 一致宣言と dot_f32 の順序不一致、
    ヘッダ内 `ERGO_MATH_SIMD` 既定値 / `io/file.cpp` の to_fs / `scene/scene.cpp` の ifstream 直渡し・trunc 直書き・version 未検査。
  - Ergo と Ludellus-Native の双方: `shaders/particle_*.comp` の `struct Particle` 二重定義、glslc が無いときのスキップ。
  - Ludellus-Native: msquic の例外境界と二重 delete / `datagram.cpp:32` の uint16 切り詰め / FORCE OFF・テストのスキップ・`/src` の include・third_party の借用 /
    mediapipe ローダ (相対パスへの縮退、`LoadLibraryW`、ABI ミラーの重複) / MultiByteToWideChar ラッパ 5 つの集約 /
    `artifact_store.cpp` の remove_all → rename / `player_link.cpp` の既定値への化け / `hot_file.h` の書きかけ読み込み /
    world 層の libm 直接呼び出し / `suika/game.h` の next_int の off-by-one。
  - 改名系: mini-gtest の改名と NOTICES の訂正、`BIND_VAR` の改名、`ERGO_AUDIO_BACKEND` の既定値。

## Revisor への提案

次の 5 件を本書の採択と同時に Revisor へ Issue として起こす。**実装されるまでは §C9.5 の規則表と cpp-tidy (clang-tidy) で代替する**。
代替している間、該当 §C の担保は「規則表 + cpp-tidy」であり、Praesidium の pass を根拠にしない (§C2.11)。

1. `native.banned-api` の拡張 — §C2.1 の追加関数 (`strncpy`、`strtok`、`scanf` 系、`atoi` 系、`std::sto*`、`alloca`、`rand/srand`)。
2. tripwire の追加 — 非リテラル書式の `snprintf` (§C2.1) と `LoadLibrary(A|W)` (§C1.8)。
3. ヘッダを TU に結び付ける `covers` の追加 — ヘッダだけの変更の coverage gap を塞ぐ (§C2.10、§C3.6)。
4. analyzer の checker 集合への `optin.taint.*` の追加 (§C2.3)。
5. 同じく `cplusplus.NewDelete*` の追加 (§C6.4)。

## 未実装の担保

次の担保は本文に書いたが、まだ実装していない。**実装されるまで担保に数えず**、該当 §C は memory (レビュー) と残りの手段で担保する。
各項目は Issue で追跡し、実装したらこの一覧から消して担保マトリクスを更新する。

1. `AIFormat/scripts/check-rule-ids.mjs` (§C9.1 / §C9.2 / §C2.11) — §C の ID の重複、参照する §N の実在、REVIEW 列との対応、
   規則表の各規則が実在する §C を指すこと、スキルの同期のずれを検査し、`scripts/harness-check.mjs` から呼ぶ。推奨する順序 1 で作る。
2. `AIFormat/scripts/cpp-changed-units.mjs` (§C9.6) — 変更ヘッダを include する TU を `clang -MM` (compile_commands.json) で展開する。
   現在の変更集合は `cpp/rules/lib/git-diff.mjs` が変更行と変更ファイルだけを集めている。
3. GenericTaint の Config (§C2.3) — recv / read / fread を taint source にする設定。LLVM 19 では alpha
   (`clang-analyzer-alpha.security.taint.GenericTaint`) なので、LLVM 20 以降へ上げるときに `cpp/.clang-tidy` へ入れる。
4. clang-tidy の名前で禁止 API を足す設定 (§C2.1) — `bugprone-unsafe-functions.CustomFunctions` は LLVM 20 以降の option。
   それまでは規則表と Praesidium tripwire が担保する。

## 採らなかった論点

- **constexpr 既定と consteval / constinit の使い分け**: 根拠に誤りがあり (bind_dummy.cpp:7 は機能トグル)、中身は RULE_CODE §6・§19 と §C8.6 の言い換え。
- **ヘッダのインライン実装を抑え PCH / unity build を使う**: 「数行」の基準が判定できず、Vulkan を公開 API にする Pictor と両立しない。windows.h の禁止は §C4.9・§C8.5、設定マクロ問題は §C4.10 へ移した。
- **浮動小数の比較は EXPECT_NEAR に限る**: 判定できず、FLOAT_EQ を ULP 比較へ変えると既存 194 件の意味が変わる。罠一覧 (§C3.1) に統合し、決定性は bit 一致 (§C3.11) で扱う。
- **新規 .cpp を必ず Praesidium に登録する**: Praesidium が既に fail-closed で強制しており重複。
- **ベンチを基準値と比べて PR の gate にする**: 共有ホストのゆらぎで不安定に落ちる。まずはゲートにしない参考レポートから。
- **const 既定と misc-const-correctness**: RULE_CODE §19 と同内容で、check のノイズが既存ファイル全体の修正を強いる。
- **ホットパスでの std::function 禁止**: 証拠の呼び出し頻度が低く実害が無い。要素単位の間接呼び出しは §C1.5 (ERGO_HOT 内のループ) で押さえる。
- **praesidium.json 全体を自動生成し、全 TU のずれを gate で落とす**: compile_commands がプラットフォームや option で変わり不安定。Praesidium の fail-closed で足り、生成スクリプトは任意の道具に留める。変更 TU だけの照合は §C2.10 で行う。
- **レイヤ順を CMake の依存グラフで gate にする**: Ergo には `ergo_<domain>` 間の依存が既に多数ある。order / allow の宣言は Ergo 側 spec/domains の課題。
- **ロジック層を固定小数点に限る**: 決定性は §C7.4 のフラグ・libm 集約・評価順序で確保でき、既存の float ロジックの全面書き換えを強いる必要はない。
- **個別に削ったもの**: `-Wpedantic` (`##__VA_ARGS__` で大量警告) / `pro-bounds-*`・`owning-memory`・`no-malloc`・`modernize-use-nodiscard`・`misc-const-correctness`・`concurrency-mt-unsafe` /
  `modernize-avoid-c-arrays` を §C1.6 の担保にすること / `cert-msc32-c`・`cert-msc51-cpp` (固定 seed と逆向き) / Praesidium へのスタイル規則の混入 /
  std::format の必須化と ostringstream の禁止 (Apple の deployment target を規約で決めることになる) / ALIAS リンクの必須化 / 「前回よりテスト数が減ったら fail」/
  CTest の LABELS を Anatomia ドメインと一致させること (Revisor は LABELS を読まない) / interface と concept の二重定義 (static_assert によるミラー) /
  render スレッド全体のブロッキング禁止 / Vulkan ハンドルのデストラクタ即時解放 (frames-in-flight と衝突) / baseline を 1 target のまま PUBLIC か PRIVATE を選ぶ案 (どちらでも §C4.1 か §C4.3 と矛盾するので 2 つに分割した)。

---

## なぜ？

- C++ は「コンパイルが通る」ことが正しさの証拠にならない。UB・ODR 違反・toolchain 差は、型 (concept、Expected、ビュー型) とビルド設定 (baseline、警告、fp フラグ) で
  書いた時点に止めるのが最も安い。
- Revisor の Praesidium は変更 TU を解析するが、ヘッダだけの変更や taint を見ない。書く側の規則表・clang-tidy・sanitizer・fuzz でその外側を覆い、Praesidium の pass を過信しない。
- ゲームのリプレイとサーバ照合は決定性が前提で、乱数・時計・浮動小数のどれか 1 つが漏れるとプラットフォームごとに結果が分かれる。決定性はテストで bit 一致を固定して初めて守れる。
- AI は記憶した規約を忘れ、Codex にはフックが効かない。だから hook と gate が同じ規則表を使い、記憶だけの規約を §C6.2 の 1 件に絞った (まだ実装していない担保は「未実装の担保」に分けて書く)。

## 運用 (規約の所在と強制)

本規約は次の 4 層で運用する。**本文の正本はこの `RULE_CODE_CPP.md` のみ** とし、他層は重複保持せず参照・同期する。

| 層 | 役割 | 実体 |
|----|------|------|
| **正本** | single source of truth | この `AIFormat/RULE_CODE_CPP.md` |
| **ツール設定の正本** | 機械が読む設定 | [`cpp/`](./cpp/) (`.clang-format` / `.clang-tidy` / `.editorconfig` / `LudiarsCxxBaseline.cmake` / `rules/cpp-rules.mjs`、使い方は [`cpp/README.md`](./cpp/README.md))。各 C++ リポには版を書いた同期コピーを置く |
| **スキル** | C++ を書くときに手元へ出す窓口 | Castra の `cpp-conventions` スキル (本書の同期コピー)。`coding-conventions` からは 1 行のポインタだけ |
| **harness** | 機械的トリップワイヤ + 要点注入 | 規則表 (`cpp/rules/cpp-rules.mjs`) + C++ / CMake / シェーダ編集時の PostToolUse フック (`cpp-convention-check.mjs`)。同じ規則表を Revisor の `cpp-build-policy` gate も使う |

- レビュー時は、担保マトリクスの REVIEW 列 (CQ / VU / VL / DS / QA) が指す各レビューの C++ 項目で裏取りする
  ([`common/REVIEW_CODE_QUALITY.md`](./common/REVIEW_CODE_QUALITY.md)・[`common/REVIEW_VULNERABILITY.md`](./common/REVIEW_VULNERABILITY.md)・
  [`local-app/REVIEW_VULNERABILITY_LOCAL.md`](./local-app/REVIEW_VULNERABILITY_LOCAL.md)・[`common/REVIEW_DESIGN.md`](./common/REVIEW_DESIGN.md)・
  [`common/REVIEW_QUALITY.md`](./common/REVIEW_QUALITY.md)。Praesidium の結果の読み方は §C2.11)。
- 規約を変更したら、正本 → `cpp/` のツール設定と規則表 → スキルと各リポの同期コピーの順に更新する。§C 番号を変えたときは規則表の参照も同じ PR で直す (§C9.1)。
- RULE_CODE.md 第 II 部を変更したときは、本書の「関係」欄が指す §N がずれていないかを確認する。
