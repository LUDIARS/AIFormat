# Leak checker

AIFormat provides two related commands:

- `env-leak-checker.mjs` scans one local repository or a local workspace.
- `github-public-leak-audit.mjs` discovers repository visibility with the
  authenticated GitHub CLI and scans repositories already present in a local
  workspace.

Neither command scans git history, issues, pull requests, releases, or wikis.
Use `script_design/SECRET_HISTORY.md` for the separate history-scanning design.

## Keep the sensitive vocabulary local

Do not add private project names, client names, personal names, or related terms
to tracked AIFormat files. Copy the empty template to the ignored local path:

```powershell
Copy-Item scripts/env-leak-keywords.json scripts/env-leak-keywords.local.json
```

The config supports legacy strings and redacted labels:

```json
{
  "keywords": [
    {
      "id": "engagement-1",
      "value": "<private term>",
      "match": "token"
    }
  ],
  "ignore_patterns": [
    "docs/approved-public-example.md"
  ]
}
```

Reports contain `id`, not `value`. Use neutral IDs that do not reveal the private
term. `match` is `substring` by default or `token` for word-boundary matching.
`ignore_patterns` uses repository-relative `*`, `**`, and `?` globs.

## Local scan

```powershell
node scripts/env-leak-checker.mjs scan C:\path\to\repo `
  --config scripts/env-leak-keywords.local.json
```

Exit status is `1` when findings exist. Matching source lines are omitted unless
the operator explicitly passes `--show-content`. Workspace-wide scan and the GUI
require `LUDIARS_BASE`; there is no machine-specific fallback path.

## GitHub public audit

Authenticate `gh` with permission to read the requested organization inventory.
Private repository names are derived at runtime and assigned hash-based labels;
they are never written to AIFormat:

```powershell
node scripts/github-public-leak-audit.mjs `
  --org <organization> `
  --workspace C:\path\to\local\workspace `
  --keywords-file scripts/env-leak-keywords.local.json `
  --output C:\secure-local-path\public-leak-report.json `
  --verbose
```

Repeat `--org` to audit multiple organizations. With `--workspace`, the command
joins local origin URLs to GitHub visibility and scans only files returned by
`git ls-files`. It scans both public and private local repositories, but discards
private-repository findings and reports only their count. Public repositories
missing from the local workspace are listed as skipped; no clone, archive, or
other source download is attempted. An inventory, visibility, or local scan
failure makes the audit incomplete and returns exit `2`.

Use `--target-org` when private-name inventory must come from several
organizations but public repositories should be scanned in smaller batches.
Every target organization must also be present as `--org`.

Reports intentionally omit keyword values and matching source content. Private
findings never include repository names, paths, or labels in the report.
Verbose progress and scan errors for repositories that are not confirmed public
use opaque hash labels and suppress underlying path details. Keyword values in
public repository names, file paths, and public scan errors are replaced with
their neutral IDs. Legacy string-only keywords receive hash-based IDs instead
of using the sensitive value as an ID. Keep the keyword file and any report
containing public-reference locations out of public repositories and CI logs.
