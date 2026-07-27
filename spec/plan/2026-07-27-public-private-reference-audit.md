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
