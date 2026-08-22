#!/usr/bin/env node
/**
 * scaffold-spec — 新規リポに FORMAT_SPEC.md 準拠の spec/ 雛形を用意する。
 *
 * 新規リポ作成時、設計を DESIGN.md に書いて満足し spec/ 分類フォルダに落とさない
 * 事故が頻発した (2026-06-19 新規6リポ全件)。着手時に雛形を撒いて穴を塞ぐ。
 *
 * やること (すべて冪等。既存ファイルは上書きしない):
 *   1. spec/{data,feature,interface,setup,test}/ に分類の README 雛形を作る
 *      (plan/ は作業ドキュメント、faq/・knowledge/ は随時追記型、domains/ は
 *       機械可読なドメイン定義なので必要時に手で作る → 雛形は撒かない)
 *   2. spec/README.md に索引を置く
 *   3. .gitignore の無アンカー `data/` を `/data/` にアンカー (spec/data/ を守る)
 *
 * Usage:
 *   node scaffold-spec.mjs [repoDir]   # 既定は cwd
 *   node scaffold-spec.mjs --dry       # 変更せず予定だけ表示
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const repoDir = args.find((a) => !a.startsWith("--")) || process.cwd();
const specDir = join(repoDir, "spec");

// 常設 5 分類の README 雛形 (FORMAT_SPEC.md §2, §4-5, §9-10 の要点を 1 行ガイドで)。
const CLASSES = {
  data: `# data/ — データスキーマ

DB / 永続データを持つなら、テーブル/コレクション定義 (カラム名・型・制約・デフォルト)、
リレーション、インデックス/ENUM、マイグレーション方針 (冪等性) を記載する。
種別分類・保存先・保護要否は RULE_DATA_SCHEMA.md に従う。

> 1 対象 = 1 ファイル (例: \`data/users.md\`)。DB が無いなら本分類は不要。
`,
  feature: `# feature/ — 機能概要 (1 機能 1 ファイル)

利用者から見た「機能」単位で **1 機能 = 1 ファイル** で書く (例: \`feature/bookmark-save.md\`)。
目的・ユーザーストーリー / 振る舞い (入力→処理→出力) と状態遷移 / 制約・既知の制限 /
関連する data・interface への参照を記載する。
`,
  interface: `# interface/ — API・外部連携

サービスの外部接点 (境界=contract) を書く。内部実装ではなく契約を記す。
REST/WebSocket/gRPC/IPC/CLI のエンドポイント (メソッド・パス・req/res・エラー)、
認証・認可境界 (Cernere)、外部サービス連携、イベント/Webhook ペイロードを記載する。

> ライブラリなら公開 export (関数/型のシグネチャ) が contract。
`,
  setup: `# setup/ — セットアップ

開発・運用の立ち上げ手順。前提 (ランタイム・バージョン・外部サービス)、
環境変数/シークレットの一覧と取得元、ローカル起動/migration 適用、デプロイ手順を記載する。
`,
  test: `# test/ — テスト

テスト設計。種別 (ビルドチェック/ユニット/smoke/統合/E2E) ごとに「何を担保するか」、
対象・ローカルでの実行方法・リリース判定での扱い・現状・やることを書く。方針は RULE_TEST.md。
`,
};

const INDEX = `# spec/

このリポジトリの設計仕様。FORMAT_SPEC.md の標準9分類を基本に管理する
(\`plan/\` は実装の都度作る作業ドキュメント、\`faq/\`・\`knowledge/\` は随時追記型、
\`domains/\` はコードとテストを被覆する \`*.domain.json\` を用意するときに作るので
雛形には含めない。発生した問題は \`knowledge/problems/\` に蓄積する)。

- [data/](./data/) — データスキーマ
- domains/ — コードの帰属先を定義する \`*.domain.json\` (必要時に作成)
- faq/ — 調査結果・よくある質問 (必要時に作成)
- [feature/](./feature/) — 機能概要 (1 機能 1 ファイル)
- [interface/](./interface/) — API・外部連携の contract
- knowledge/ — 蓄積型ナレッジ (\`problems/\` 等。必要時に作成)
- plan/ — 設計・実装計画 (実装の都度作成)
- [setup/](./setup/) — セットアップ
- [test/](./test/) — テスト設計

> 分類は固定ではない。プロジェクト固有の正本には追加フォルダや直下ファイルを使ってよい。
> 標準5フォルダの欠落は \`check-spec-structure.mjs\` が warning で通知する。
`;

const created = [];
const skipped = [];

function ensureDir(p) {
  if (!existsSync(p)) { if (!DRY) mkdirSync(p, { recursive: true }); }
}
function writeIfAbsent(p, content) {
  if (existsSync(p)) { skipped.push(p); return; }
  if (!DRY) writeFileSync(p, content, "utf8");
  created.push(p);
}

ensureDir(specDir);
writeIfAbsent(join(specDir, "README.md"), INDEX);
for (const [name, body] of Object.entries(CLASSES)) {
  ensureDir(join(specDir, name));
  writeIfAbsent(join(specDir, name, "README.md"), body);
}

// .gitignore の無アンカー data/ を /data/ にアンカー (spec/data/ を巻き込まない)。
let gitignoreFixed = false;
const giPath = join(repoDir, ".gitignore");
if (existsSync(giPath) && statSync(giPath).isFile()) {
  const lines = readFileSync(giPath, "utf8").split(/\r?\n/);
  let changed = false;
  const out = lines.map((l) => {
    if (/^data\/?$/.test(l.trim())) { changed = true; return l.replace(/^(\s*)data(\/?)\s*$/, "$1/data$2"); }
    return l;
  });
  if (changed) {
    gitignoreFixed = true;
    if (!DRY) writeFileSync(giPath, out.join("\n"), "utf8");
  }
}

const tag = DRY ? "[dry] " : "";
console.log(`${tag}scaffold-spec: ${repoDir}`);
for (const p of created) console.log(`  + ${p.replace(repoDir, ".").replace(/\\/g, "/")}`);
if (skipped.length) console.log(`  (既存 ${skipped.length} ファイルは温存)`);
if (gitignoreFixed) console.log(`  ~ .gitignore: data/ → /data/ にアンカー`);
if (!created.length && !gitignoreFixed) console.log("  変更なし (既に整備済み)");
