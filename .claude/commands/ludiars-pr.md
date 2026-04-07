# LUDIARS 全リポジトリ PR ステータス確認コマンド

クローン済みの LUDIARS リポジトリすべての PR 状況を一括表示します。

## 処理フロー

### 1. クローン済みリポジトリの検出

`<workspace-root>/` 配下の各ディレクトリについて:
- `.git` が存在すること
- `git remote get-url origin` が `LUDIARS` を含むこと

上記を満たすディレクトリを LUDIARS リポジトリとして列挙する。

### 2. 各リポジトリの PR 取得

各リポジトリで以下を実行:

```bash
gh pr list --state open --json number,title,headRefName,updatedAt,author,labels,reviewDecision
```

### 3. 結果を統合表示

以下のフォーマットで表示すること:

```
## LUDIARS PR ステータス

### {リポジトリ名} ({open PR 件数}件)

| PR | タイトル | ブランチ | 作成者 | 更新 | レビュー |
|----|---------|---------|--------|------|---------|
| #87 | feat: WS Phase 3 | docs/ws-spa-migration | user | 1時間前 | APPROVED |
| #85 | fix: 型修正 | fix/type-error | user | 3日前 | CHANGES_REQUESTED ⚠️ |

### {リポジトリ名} (0件)
（オープンPRなし）

---

### サマリ
| リポジトリ | オープンPR | 要対応 |
|-----------|----------|--------|
| Schedula | 2 | 1 ⚠️ |
| Cernere | 0 | - |
| ars | 3 | 0 |
| **合計** | **5** | **1** |
```

## 表示ルール

- 「更新」列は相対時間で表示（例: 1時間前、2日前）
- `CHANGES_REQUESTED` のPRには ⚠️ マークを付ける
- オープンPRが 0 件のリポジトリは「（オープンPRなし）」と 1 行で表示
- リポジトリはオープンPR件数の降順でソート
- 「要対応」は `CHANGES_REQUESTED` の件数

## スクリプト実行

コマンドラインから直接実行する場合:

```bash
# Linux / macOS / Git Bash
bash scripts/ludiars-pr.sh [base_dir]

# Windows (cmd.exe)
scripts\ludiars-pr.bat [base_dir]
```

デフォルトの `base_dir` は `<workspace-root>`。

## 注意事項

- **読み取り専用**: ファイル変更・コミット・ブランチ切り替えは一切行わない
- `gh` コマンドが使えない場合はその旨を表示してスキップ
- ネットワークエラー時はそのリポジトリをスキップして続行
