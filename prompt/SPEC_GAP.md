# 仕様欠落検知・spec 自動生成プロンプト (Spec Gap Detection & Generation Prompt)

デイリーレビューの一環として、実装と `spec/` を突合して**仕様欠落**
(実装にあるのに spec が無い) と**陳腐化** (spec にあるのに実装に無い) を検知し、
欠落分の spec を [`FORMAT_SPEC.md`](../FORMAT_SPEC.md) 準拠で自動生成するための実行プロンプト。

- 記法・分類の正本: [`FORMAT_SPEC.md`](../FORMAT_SPEC.md) (8 分類・充実度の定義)
- 充実度の評価先: [`common/REVIEW_QUALITY.md`](../common/REVIEW_QUALITY.md) §3 ドキュメント完備性
- 生成 PR の運用: [`REVIEW.md`](../REVIEW.md)「自動修正ポリシー (AUTOFIX)」
- 共通の設計原則: [`prompt/README.md`](./README.md)

## 検知アルゴリズム

役割分担は 3 層。**構造**は CI が決定的に守り、**該当性**と**生成**を本プロンプトが担う。

| 層 | 何を検知するか | 担い手 |
|----|--------------|--------|
| 構造 | 非正規フォルダ / 分類外ファイル / `.gitignore` 罠 | [`check-spec-structure.mjs`](../scripts/check-spec-structure.mjs) (CI・決定的) |
| 該当性 | 「この実装ならこの spec があってしかるべき」の判断 | 本プロンプト Phase A〜C |
| 生成 | 欠落 spec のドラフト生成と自己検証 | 本プロンプト Phase D〜E |

該当性の検知は **シグナル方式**: 実装側の決定的なシグナル (下表) を検索で収集し、
spec 側の記載対象と**両方向で**突合する。シグナル → 候補 → LLM の該当性判断 → 確定、
の順に絞ることで、「一律の枚数を課さない」(FORMAT_SPEC §9) と「見落とさない」を両立する。

> Phase A・B の決定的部分は機械化する設計がある
> ([`script_design/SPEC_GAPS.md`](../script_design/SPEC_GAPS.md)、実行は Anatomia)。
> `check-spec-gaps.mjs` の出力 (violations) が利用できる場合、Phase A・B はその結果を
> 入力として使い、Phase C (該当性判断) から開始してよい。

| 分類 | 実装側シグナル (例) | 突合の単位 |
|------|-------------------|-----------|
| `data` | `migrations/` / `*.sql` / ORM スキーマ定義 (drizzle・prisma・sqlx 等) / 永続ファイル・SQLite への書き込み | テーブル / ストア単位 |
| `interface` | HTTP ルート定義 (router・controller) / OpenAPI・proto / WebSocket・IPC ハンドラ / ライブラリの公開 export / CLI 引数定義 / Webhook 受け口 | エンドポイント / 公開 API 単位 |
| `feature` | ルーティング群・画面 / ページ・コマンド・常駐処理など、利用者から見た機能単位 | 1 機能 1 ファイル (FORMAT_SPEC §3) |
| `setup` | `package.json` scripts / Dockerfile・compose / `.env.example`・環境変数参照 / CI workflow | 分類単位 (手順・env 一覧の網羅) |
| `test` | テストディレクトリ / テストランナー設定 / CI のテストステップ | テスト種別単位 (RULE_TEST の種別) |

`plan/` (作業ドキュメント) と `faq/`・`knowledge/` (随時追記型) は充実度対象外のため検知対象外。

---

```text
あなたは仕様ドキュメント整備専任のエージェントである。対象リポジトリの実装と `spec/` を
突合し、(1) 仕様欠落・陳腐化を検知してレポートし、(2) 欠落した spec を AIFormat の
FORMAT_SPEC.md 準拠で生成して PR を作成する。spec 以外のコードは変更しない。

## 原則 (すべてに優先)

1. コードが ground truth。spec にはコードから確認できた事実だけを書く。コードから
   読み取れない設計意図・将来計画を創作しない。判断が要る不明点は本文に
   「TODO(要確認): 〜」として残し、勝手に確定させない。
2. 検知と生成を分ける。まず全ギャップを列挙し確定させてから生成に入る
   (生成しながら探さない)。
3. 既存 spec を上書き・削除しない。生成対象は「ファイルが存在しない欠落」のみ。
   既存 spec と実装の食い違い (陳腐化) は検知レポートに載せて人間に委ねる。

## 手順

### Phase A — シグナル収集 (実装側)
リポジトリを走査し、SPEC_GAP.md の表に従って分類ごとのシグナルを検索で収集する。
- data: migrations / SQL / ORM スキーマからテーブル・ストアを列挙する
- interface: ルート定義・公開 export・CLI 定義からエンドポイント・公開 API を列挙する
- feature: エントリポイントから辿れる利用者視点の機能を列挙する
- setup: scripts / Dockerfile / 環境変数参照 / CI workflow を列挙する
- test: テストディレクトリ・設定・CI のテストステップを列挙する
使った検索パターンと対象範囲を必ず記録する (「無い」の主張は検索ログが根拠になる)。

### Phase B — 突合 (spec 側)
`spec/` の現状 (分類フォルダ・ファイル一覧・各ファイルの記載対象) を列挙し、
Phase A の結果と両方向で突合する:
- 実装にあるが spec に無い → 欠落候補
  - 分類レベル: シグナルがあるのに spec/<分類>/ が無い・実質空
  - 個別レベル: feature は機能列挙と spec/feature/*.md (1 機能 1 ファイル)、
    data はテーブル列挙と spec/data の記載、interface はエンドポイント列挙と
    spec/interface の記載を突合する
- spec にあるが実装に無い → 陳腐化候補 (削除・改名された機能の spec 残骸)

### Phase C — 該当性判断 (誤検知の除外)
各候補について実装を実際に読み、誤検知を除外する。例:
- テスト fixture・サンプルの SQL を data と誤認しない
- 内部専用ヘルパを公開 API (interface) と誤認しない
- 一時スクリプト・実験コードを feature と誤認しない
除外は理由つきで記録する。確定した欠落・陳腐化には指摘 ID (SPEC-001 形式、
REVIEW.md「指摘の記載ルール」) を付け、欠落には根拠となるシグナルの file:line を添える。

### Phase D — 生成 (欠落のみ)
- FORMAT_SPEC.md の該当分類の「記載内容」に従い、1 対象 1 ファイルで生成する
  (モジュール構成は feature/<module>-<feature>.md 等のファイル名規約に従う)。
- 記載する事実 (テーブル定義・エンドポイント・script 名・環境変数名) はすべて
  Phase A〜C で実装から確認したものに限る。各記述が実装のどこに遡れるかを
  意識して書く (spec 本文に file 参照を残してよい)。
- 「目的・ユーザーストーリー」等、コードから断定できない項目は、コードの挙動から
  読み取れる範囲で書き、それ以上は「TODO(要確認)」にする。

### Phase E — 自己検証と出力
1. 生成した spec に記載した全対象 (テーブル / エンドポイント / script / 環境変数) を
   実装から grep し直し、実在と綴りの一致を確認する。実在しない記述が 1 つでも
   あれば修正してから先に進む。
2. `check-spec-structure.mjs` を実行し green を確認する。
3. 検知レポートを出力する: 欠落 (生成した / 生成対象外とした)・陳腐化・除外した
   誤検知の一覧 (ID・根拠・検索ログ)。デイリーレビューで REVIEW_QUALITY §3
   (ドキュメント完備性) の指摘としてそのまま使える形式にする。
4. 生成 spec は feat ブランチ + PR にする (AUTOFIX ポリシー準拠: 1 分類または
   1 機能 = 1 PR、main 直 push 禁止)。PR 本文に対応する指摘 ID・根拠シグナル・
   「TODO(要確認)」の残数を明記する。

## 禁止事項

- 既存 spec ファイルの上書き・削除 (陳腐化はレポートのみ)
- コードから確認できない仕様の創作・推測での確定
- spec/ 以外への書き込み・コード変更
- 検知を省略していきなり生成する / レポート無しで PR だけ出す
```
