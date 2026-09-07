---
title: Anatomia / Praeforma の UX 共通参照契約
type: interface
service: aiformat
domain: core-domain-ux
status: planned
---

# Anatomia / Praeforma の UX 共通参照契約

書式: [FORMAT_UX.md](../../FORMAT_UX.md)。以下は consumer 実装の受け入れ条件であり、
本書を追加しただけで両サービスに自動読取機能が搭載されたと扱わない。

## 文書識別

両 consumer は `repositoryId / path / documentId / contentHash` を同じ意味で保持する。
詳細な解決規則、状態軸、診断、cache、v1 payload は
[UX 参照読取契約](ux-reference-read-contract.md)を正本とする。
`documentId` は frontmatter の `id`、`repositoryId` は Anatomia に登録された正規 repository の
安定 ID であり、API の任意の `projectId` を無条件に転記しない。Praeforma は `anatomiaRepo`
resolver で登録との対応を検証する。alias、worktree、同名の別 repository は診断対象とする。
`contentHash` は正本ファイルの UTF-8 バイト列に対する SHA-256。読み取り時に改行や Unicode を
正規化しない。パスは対象リポジトリ内の相対パス。
派生表示・キャッシュは元の ID とハッシュを必ず保持し、同名文書だけで対応付けない。

価値 ID は `documentId` 内で安定かつ一意とする。同じ価値 ID を別文書で使うことはできるため、
同一 repository 内の参照は `documentId / valueId`、cross-repository 参照は
`repositoryId / documentId / valueId` の組で運ぶ。reader は新旧の価値節見出しを読み、既存の
`UX-W1`、`UX-C1` 等を改名しない。既存 wire の `winIds` は互換入力として扱えるが、
新規 payload は `valueIds` を用い、両方が矛盾したら一方を推測で採らず
`conflicting_value_id_fields` として拒否する。

## Anatomia

1. `spec/ux/` を仕様読み取り対象とし、`ux_definition: 1` を検出する。
2. `domain` とドメイン定義の `specRefs` を相互確認する。product_ux の解決・ID 重複・参照切れを診断する。
3. plan / ドメインレビューへ「問題・価値 ID・制約・承認状態・正本参照」を供給する。
4. UX は業務上の正本。コードから生成した説明で上書きしない。
5. 対象差分に関係する UX の存在・承認・参照整合を検査する。未対応と合格を区別する。

## Praeforma

1. プロダクト全体 → コアドメイン → UX → 画面/シナリオの順で参照する。
2. Anatomia 経由の射影にも元ファイルの参照とハッシュを保持する。
3. 画面・会話・仕様の提案には価値 ID を付ける。画面のないプロダクトもシナリオとして扱う。
4. 本文の編集は正本への変更提案。ローカル DB のコピーだけを更新して確定しない。
5. Cc への実装委託に UX の参照と必要な価値 ID を含め、前の版を現在の承認として使わない。
6. 不足・矛盾の対話的解決は [UX 価値対話契約](../feature/ux-value-dialogue.md)に従う。

## 失敗時と導入

新規 consumer は `missing / invalid / stale / unavailable / ready` の読取状態、本文の作成 lifecycle、
版別の人間承認を別の軸で返す。旧 combined state の `draft` は互換入力時に
`authoredLifecycle: draft` へ分解する。原文と参照整合を再検証できた場合だけ `readState: ready`、
検証不能なら `stale` または `unavailable` と診断を返す。新規 API は `draft` を read state として返さない。
`ready + unreviewed` は閲覧できるが、承認済み入力としての委託・受け入れには使えない。
承認 provider が未対応なら `approvalState: unknown`、照会失敗なら `unavailable` とし、
どちらも閲覧だけを許可して承認必須の行為には使わない。
`approved` 以外の承認状態 (`changes_requested / revoked / stale` を含む) はすべて
同様に扱い、承認済み入力にしない。
古いキャッシュの閲覧は状態を明記して許容できるが、現在版の承認や合格へ昇格させない。
consumer 非対応時は文書を手動参照できる。自動ゲート未導入を「強制済み」と報告しない。
各 consumer の追加実装は対象リポジトリの別 PR で行い、正本の同一版を読むことを検証する。

## 受け入れ確認

- 両 consumer に同じサンプルを与えると文書 ID・価値 ID・ハッシュが一致する。
- 一方のキャッシュを古くすると stale となり、その版では新しい委託を受理しない。
- 参照切れ、重複 ID、draft lifecycle、文書の変更後の古い承認をそれぞれ検知する。
- 非 UI プロダクトでも画面定義を要求せず問題・価値・シナリオを参照できる。

これは後続 consumer 実装の受け入れケースであり、本 PR では実行せず、実装済みとも扱わない。
具体的な入力と期待結果は[参照読取契約のケース表](ux-reference-read-contract.md#受け入れケース)に定める。
