# Public/private reference audit

## Purpose

Prevent names and related vocabulary from private repositories or engagements from
appearing in public repository metadata or a locally available tracked tree.

The checker is a local CLI. It uses the authenticated GitHub CLI to discover
repository visibility, derives exact private-repository names without committing
them to AIFormat, and scans repositories already present in the local workspace.
It never clones or downloads repository content.

## Priorities

1. Do not turn the public checker configuration or its output into a second leak.
2. Never classify an unknown local repository as private.
3. Keep repository discovery, keyword configuration, file scanning, and CLI
   orchestration as separate responsibilities.

## Design

- `scripts/leak-checker/keyword-config.mjs` validates tracked example and
  gitignored local keyword files.
- `scripts/leak-checker/scanner.mjs` scans a directory case-insensitively and
  returns keyword labels, paths, and line numbers. File content and keyword
  values are omitted by default.
- `scripts/leak-checker/github-repositories.mjs` obtains repository metadata
  through `gh repo list`, derives stable redacted labels for private repository
  names, joins local origin URLs to visibility, and lists tracked files.
- `scripts/github-public-leak-audit.mjs` owns local scan selection, visibility
  filtering, output formatting, and exit status.
- `scripts/env-leak-checker.mjs` reuses the same scanner for local checks.

Engagement-specific terms belong in `scripts/env-leak-keywords.local.json` or an
explicit `--keywords-file` outside the repository. Only a placeholder example is
tracked.

## Detection scope

- Public repository name and description metadata.
- Git-tracked files in each repository already present directly under the local
  workspace, using its current working-tree content.
- Private local repositories are scanned, but their findings are discarded and
  represented only by an aggregate count.
- Exact private repository names automatically derived from the authenticated
  inventory.
- Explicit aliases and related vocabulary supplied by the local keyword file.

Public repositories absent from the local workspace are listed as skipped. Git
history, untracked files, issues, pull requests, releases, wikis, and external
search indexes are not claimed by this command. History scanning remains the
separate `SECRET_HISTORY` concern.

## Failure contract

- Exit `0`: audit completed with no findings.
- Exit `1`: one or more public-reference findings.
- Exit `2`: invalid input, inventory/visibility failure, or local scan failure.
- `--json` emits a stable report without source-line content or keyword values.

## Verification

- Unit tests cover case-insensitive matches, ignored files and paths, redaction,
  config validation, visibility parsing, private-name derivation, and public
  metadata findings.
- A live audit uses a gitignored keyword file and the authenticated organization
  inventory.
- A final self-scan confirms that engagement-specific terms are absent from the
  committed diff.

## 2026-09-04 追補: 履歴監査と、取りこぼしていた 3 点

作業ツリーだけの監査では足りないことが実地で分かった。 未公開プロダクト名を
件名に含む公開コミットが見つかり、**ファイルを消してもメッセージは残る**という
当たり前の経路が塞がれていなかった。

### 1. コミットメッセージを見る監査を足した

`scripts/github-public-history-audit.mjs` + `scripts/leak-checker/git-history.mjs`。

- 見るのは **リモートに到達している ref だけ** (`git log --remotes=origin`)。
  ローカルにしかないコミットはまだ公開されていないので、監査を落とす理由にならない
  — 直す先が「履歴書き換え」ではなく「送る前に直す」になり、対処がまるで変わる。
- clone しない。 既にローカルにあるリポジトリだけを見るのは既存監査と同じ。
- **報告はコミット id と登録語 id だけ。** 語そのものもメッセージ本文も載せない。
  レポートは共有され得るので、載せると report 自体が二次的な流出になる。

### 2. 同名リポジトリの取りこぼしを直した

`chooseWorkspaceRepository` は同じ `owner/name` を指すローカル checkout が
複数あっても **1 つしか返さなかった**。 実際に 2 つの checkout があるリポジトリで
片方が監査から丸ごと外れていた。 `selectWorkspaceRepositories` に置き換え、
見つかった checkout を全部走査する。 片方にしか無い流出でも公開の入口としては同じ。

### 3. `gate` がハードコードの `true` だった

`github-public-leak-audit.mjs` の JSON レポートは、findings の件数にかかわらず
`gate: true` を返していた。 exit code は元から正しく分岐していたので、
食い違っていたのは JSON だけ — ただし CI やダッシュボードが読むのはそちらで、
findings がある状態を「通過」と読んでしまう。 findings と errors の両方が
空のときだけ `true` にした。

### 運用

登録語 (keyword config) は従来どおり **リポジトリ外**に置き、commit しない。
2 つの監査は同じ config を共有する:

```
node scripts/github-public-leak-audit.mjs    --org LUDIARS --workspace <root> --keywords-file <外部パス>
node scripts/github-public-history-audit.mjs --org LUDIARS --workspace <root> --keywords-file <外部パス>
```
