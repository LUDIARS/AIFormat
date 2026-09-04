# 公開リポで識別子として機能している秘匿語の改名

- 日付: 2026-09-04
- 状態: 設計 (未実装)
- 発端: 未マージ PR 69 本を登録語で走査したところ 17 本が該当した。 うち多くは
  文言のぼかしで消えるが、**関数名・ファイル名・稼働 API パス**として機能している
  ものが 3 リポジトリにあり、置換すると動かなくなる。

## 分類

流出語は「消せるもの」と「消すと壊れるもの」に分かれる。

| 層 | 性質 | 対処 |
|---|---|---|
| A | 未公開プロダクトの実装・仕様 | 記載を消す / 別リポへ移す (済: #1311 #1313 #1326 ほか) |
| **B** | **識別子として機能している顧客名・組織名** | **改名 (本設計)** |
| C | 生成物・履歴 | 追跡から外す / 履歴の打ち直し (別軸) |

B は「public リポに顧客名がある」という点で A と同じだが、値が動作に使われている
ので置換では済まない。

## 実測 (origin/main、2026-09-04)

| リポジトリ | 語 | ファイル | 行 | ファイル名に含む |
|---|---|---|---|---|
| Ostiarius | 顧客名 | 8 | 119 | 2 (`server/*-user-client.ts` と対のテスト) |
| Corpus | 顧客名 | 14 | 27 | 0 |
| **Voluptas** | 組織名 | **56** | **414** | **21** |

### Ostiarius — 関数名とファイル名

顧客名を含む client 生成関数と、それを収めたファイル名・テスト名。
呼び出し元は同一リポ内に閉じている (`server/index.ts` / `server/mobile-checkin.ts` /
`server/config.ts` ほか)。 **外部契約ではない**ので、リポ内の一括改名で閉じる。

### Corpus — 兄弟リポジトリへの相対パス

`../<顧客名>Hub/plugins` / `../<顧客名>Hub-DESIGN.md` のような**別リポジトリを指す
パス**。 プラグインパックの置き場所を説明する記述で、コードは読み込み先を設定から
受ける。 参照先リポジトリ自体が改名されない限り、パスを書き換えると説明が嘘になる。

なお当該 Hub は後継へ移行済みで**不要リポジトリ**と確認されている (2026-09-04)。
参照ごと落とせる可能性が高い。

### Voluptas — 最大。 稼働 API パスとテーブル名まで届く

- ルート実装 `src/routes/<組織名>*.js` 8 本 + テスト
- サービス `src/services/<組織名>*.js` 10 本 + テスト
- 仕様 `spec/feature/<組織名>-*.md` 4 本、`spec/domains/<組織名>-*.domain.json`
- **稼働 API パス** `/api/v1/integrations/<組織名>/surveys` 等
- migration / README / catalog

API パスは**外部契約**。 connector 側 (Corpus) が叩いており、片側だけ変えると切れる。

## 形

### 原則

1. **外部契約は互換を残して移す。** 新パスを足し、旧パスは deprecation 期間だけ
   両方受ける。 connector 側の切り替えと、既知の全 consumer が新パスへ移行したことを
   確認してから旧パスを落とす。
2. **リポ内で閉じるものは一括改名。** 関数名・ファイル名・内部変数は互換不要。
3. **改名先は役割で決める。** 顧客名を別の固有名に置き換えると同じことが起きる。
   `partner` / `education-partner` のような**役割の名前**にする。
4. **1 PR は 1 リポジトリだけを変更する。** 3 リポジトリを 1 PR にすると、どれか 1 つの失敗で
   全部が止まる。

### 順序

まず Ostiarius → Corpus → Voluptas の順にリポ内変更を行う。影響範囲が小さい順で
手順とゲートの効きを確かめてから、Voluptas → Corpus → Voluptas の順に外部契約を移す。

| # | リポジトリ | 内容 | 外部影響 |
|---|---|---|---|
| 1 | Ostiarius | 関数名・ファイル名・テスト名の一括改名 | 無し (リポ内に閉じる) |
| 2 | Corpus | 参照先パスの記述を落とす (不要リポのため) | 無し (説明文のみ) |
| 3 | Voluptas | ルート / サービス / 仕様のファイル名と識別子 | 無し |
| 4 | Voluptas | **新 API パスの追加と旧 API パスの二重受け** | **あり** |
| 5 | Corpus | connector を新 API パスへ切り替え | **あり** |
| 6 | Voluptas | 既知の全 consumer の移行確認後、旧 API パスを撤去 | あり (5 の確認後) |
| 7 | Voluptas | DB 識別子に登録語が残る場合、その互換 migration と公開 migration 群の整理 | **あり** |

### 別 PR に分けること

- **DB のテーブル名・カラム名の改名。** 稼働 DB 自体は公開リポの外だが、識別子を含む
  migration / SQL は公開面に残る。該当する場合は本設計の 0 件ゲートを満たすため改名が
  必要であり、互換 migration、rollback、既存 migration の扱いを別 PR で設計・検証する。

### やらないこと

- **履歴の打ち直し。** 本設計は「これ以上増やさない + 現在の内容を直す」まで。
  公開済み履歴は `scripts/github-repository-reset.mjs` の担当。

## 受け入れ条件

- 各リポジトリで、checkout が最新の `origin/main` と一致し、tracked file にローカル変更が
  ないことを確認したうえで、登録語の走査が 0 件になること
  (`github-public-leak-audit.mjs` は checkout の tracked file を走査し、`origin/main` を
  直接走査しない)。
- Voluptas の旧パス撤去前に、既知の全 consumer を棚卸しし、新パスへの移行を確認すること。
- Voluptas の connector 経路 (Corpus からの survey 取得) が、新パスのみで動くこと。
- 改名先が固有名ではなく役割の名前であること。

## 検証

```
node AIFormat/scripts/github-public-leak-audit.mjs --org LUDIARS --workspace <root> --keywords-file <外部パス>
node AIFormat/scripts/github-public-history-audit.mjs --org LUDIARS --workspace <root> --keywords-file <外部パス>
```

前者が現在の内容、後者が公開済みコミットメッセージを見る。 本設計の完了判定は
前者のみ (後者は履歴の打ち直しが担当)。

## 関連

- `spec/plan/2026-07-27-public-private-reference-audit.md` — 監査の設計と 2026-09-04 追補
- 秘匿ルールの正本は neco 指示 (2026-07-27)。 登録語は外部ファイルに置き commit しない
