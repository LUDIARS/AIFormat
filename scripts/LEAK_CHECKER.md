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

## Host identifiers: IP, PC path, machine name, site name

Besides the keyword list, both commands check four kinds of host-identifying
text. Use them to catch hostnames, LAN / Tailscale addresses, SSH users, and
absolute PC paths left in runbooks.

| Kind | Detection | Not reported |
|---|---|---|
| `private-ip` | built in: concrete hosts in 10/8, 172.16/12, 192.168/16, 100.64/10 (Tailscale), 169.254/16 | 127/8, 0.0.0.0, documentation ranges, public addresses, CIDR notation such as `/24`, `.0` / `.255` |
| `local-path` | built in: Windows drive absolute paths, `/Users/<name>/`, `/home/<name>/` | `<...>`, `${VAR}`, `%VAR%`, `{...}` placeholders, `~` paths, URL paths |
| `machine-name` | keywords with `"category": "machine-name"` | — |
| `site-name` | keywords with `"category": "site-name"` | — |

The patterns are built in on purpose: the keyword file never contains regular
expressions, so a malformed pattern cannot silently disable the check.

```json
{
  "keywords": [
    { "id": "machine-1", "value": "<private host name>", "category": "machine-name" }
  ],
  "categories": { "private-ip": "advisory", "local-path": "off", "site-name": "enforce" }
}
```

`categories` chooses `advisory`, `enforce`, or `off` per kind. An unlisted kind
is `advisory`. Unknown kinds or modes are configuration errors. Keywords without
a `category` and derived private-repository names keep failing the gate as before.

Advisory findings never change the exit status. `github-public-leak-audit.mjs`
puts them in `advisoryFindings` and keeps gating findings in `findings`. It also
reports `metrics.findingsByCategory` and `metrics.findingsByRepository` (counts
by kind for each public repository). Findings carry the kind and id
(`kinds`, `keywordIds`) and the file and line, never the matched value.

### Exclusions for host kinds

Host-kind findings (`private-ip`, `local-path`, `machine-name`, `site-name`) are
not counted in these places (`leak-checker/leak-exclusions.mjs`):

| Exclusion | Rule | Kinds |
|---|---|---|
| Generated reports | under `report/`, `*.html`, `*.htm`, `*.html.json` | all host kinds |
| Tests | under `test/`, `tests/`, `__tests__/`, `fixture/`, `fixtures/`; `*.test.*`, `*.spec.*` | all host kinds |
| Workspace-root-only lines | every concrete full path on the line sits under a `workspaceRoots` entry | `local-path` |

Keywords without a `category` are never excluded. Workspace roots are machine
paths, so they live only in the keyword file (`"workspaceRoots": ["<absolute path>"]`);
the public audit also treats its `--workspace` path as a root. A root that is
not an array entry of an absolute path at least two levels deep is a
configuration error. `/Users/<name>/` and `/home/<name>/` paths count as outside
the root, so a home path on the same line is still reported.

Revisor (`src/host-identifiers.mjs`, `src/leak-exclusions.mjs`) uses the same
rules for local PR review. Change both together.

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
