# Public repositories lacked a private-reference audit

- Date: 2026-07-27
- Status: fixed
- Area: repository governance / leak detection
- Severity: high confidentiality risk

## Summary

The existing environment leak checker only scanned local working trees with a
tracked fixed keyword list. It could not distinguish public from private GitHub
repositories or discover newly added private repository names. Its default
output also repeated matching source lines.

## Evidence

- `scripts/env-leak-checker.mjs` obtains repositories from a local base directory.
- `scripts/env-leak-keywords.json` is tracked in the same public repository as the
  checker.
- The scanner returns and prints up to 200 characters of every matching line.
- No test covered visibility-derived keywords, tracked-file selection,
  incomplete scans, or output redaction.

## Regression Context

This is a prevention gap rather than a known code regression. Prior
confidentiality guidance depended on operator memory and title-specific rules;
the repository-wide public/private boundary was not mechanically checked.

## Cause

The original utility was designed as an interactive local grep tool. Repository
visibility and safe handling of the sensitive keyword set were outside its
contract.

## Fix Requirements

- Discover public and private repositories from authenticated GitHub metadata.
- Derive exact private repository names without committing them to the public
  checker repository.
- Accept engagement-specific aliases only from an ignored or external file.
- Scan Git-tracked files in local repositories and report findings only when the
  GitHub inventory classifies the repository as public.
- List public repositories that are absent locally without cloning them.
- Omit keyword values and matching source content from reports by default.
- Fail explicitly when visibility cannot be established or a selected local
  repository cannot be scanned.

## Verification

Add deterministic Node tests for config validation, scanning, redaction,
visibility handling, metadata detection, tracked-file selection, and remote URL
parsing. Run a live local-workspace audit with the requested local-only
vocabulary.

Implemented verification:

- 26 Node tests passed.
- The authenticated local-workspace audit scanned 53 public and 35 private
  repositories, skipped 17 public repositories absent locally, and completed
  with no inventory, visibility, or scan errors.
- Private findings were discarded as an aggregate count; public findings caused
  the expected exit status `1`.
- The AIFormat worktree passed a separate scan using the local sensitive
  vocabulary after removing two pre-existing references.

## Output self-leak follow-up

The 2026-07-28 pre-merge audit found three additional default-output paths that
could repeat a sensitive value even though matching source content was hidden:

- verbose progress and scan errors could expose a non-public repository name or
  local path;
- a configured value embedded in a public file path or repository name could be
  repeated as part of the finding location;
- legacy string-only keyword configuration used the sensitive value itself as
  the finding ID.

Non-public repositories now use opaque labels and suppress error details.
Configured values in public locations and errors are replaced with neutral IDs,
and legacy keyword IDs are hash-derived. Regression tests cover all three
surfaces.

The authenticated end-to-end rerun scanned 57 public and 28 private local
repositories, reported one public repository missing locally, and completed
without errors. It produced the expected public findings and ignored 6,755
private findings. A full JSON scan confirmed zero configured keyword values and
zero private repository names in the generated report.

## Follow-up

History, issues, pull requests, releases, and wikis require separate authenticated
collectors. Do not present the local tracked-file audit as proof that those
surfaces are clean.
