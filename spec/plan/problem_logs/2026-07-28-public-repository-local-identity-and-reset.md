# Public repository retained local identity and workspace paths

- Date: 2026-07-28
- Status: fixed in clean snapshot
- Area: repository governance / personal data / history lifecycle
- Severity: high confidentiality risk

## Summary

The public repository retained a local account name and a machine-specific
workspace path in scripts, documentation, and generated review artifacts.
Ordinary follow-up commits would leave those values reachable in history and
pull-request diffs.

## Cause

Early cross-repository utilities used a developer workstation path as a silent
default. Later review artifacts repeated both the path and the local account
identifier while documenting the issue.

## Resolution

- Require an explicit workspace argument or `LUDIARS_BASE`.
- Replace machine-specific examples with neutral placeholders.
- Remove the local identifier from tracked review artifacts.
- Create a parentless clean snapshot branch without force push.
- Preserve the old GitHub repository as a private archived backup, then create a
  distinct repository under the original name and push only the clean root
  commit.

## Safety requirements for repository reset

- External manifest and keyword configuration are mandatory.
- Dry-run planning is the default non-mutating entry point.
- The local worktree must be clean.
- Forbidden references must be zero before snapshot preparation.
- The clean backup branch must not already exist and is never force-pushed.
- Migration requires `--apply` and an exact repository confirmation.
- The replacement repository must have a distinct GitHub repository ID.
- The archived backup must be private.
- State and audit output must remain outside the repository.

## Migration recovery verification

The first replacement-main push was correctly stopped by the local direct-main
push guard after the old repository had been renamed and the empty replacement
had been created. The tool now:

- sets the explicit main-push exception only for the initial replacement push;
- supports a separate exact-confirmation `resume` command;
- verifies the saved original repository ID against the renamed backup;
- verifies the replacement has a different repository ID before resuming; and
- never restarts the rename/create phase after a partial migration.

The resumed migration pushed the prepared root without force, verified the new
main ref, then made the renamed backup private and archived.
