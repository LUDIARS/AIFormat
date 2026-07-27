# Public repository retained local identity and workspace paths

- Date: 2026-07-28
- Status: fixed in rewritten full history
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
- Create a full-history clean branch without force push, preserving commit order,
  parent structure, metadata, and messages.
- Preserve the old GitHub repository as a private archived backup, then create a
  distinct repository under the original name and push the cleaned full history.

## Safety requirements for repository reset

- External manifest and keyword configuration are mandatory.
- Dry-run planning is the default non-mutating entry point.
- The local worktree must be clean.
- Forbidden references must be zero before snapshot preparation.
- The clean backup branch must not already exist and is never force-pushed.
- The rewritten commit count must equal the source commit count.
- The rewritten history must be stored in an external bundle for migration.
- Migration requires `--apply` and an exact repository confirmation.
- The replacement repository must have a distinct GitHub repository ID.
- The archived backup must be private.
- State and audit output must remain outside the repository.

## Migration recovery verification

The first, incorrectly parentless replacement-main push was stopped by the local direct-main
push guard after the old repository had been renamed and the empty replacement
had been created. The tool now:

- sets the explicit main-push exception only for the initial replacement push;
- supports a separate exact-confirmation `resume` command;
- verifies the saved original repository ID against the renamed backup;
- verifies the replacement has a different repository ID before resuming; and
- never restarts the rename/create phase after a partial migration.

The archived repository retained the complete original history, so the active
repository was repaired by rewriting only the configured values across all
source commits, pushing the resulting full history to a new branch without
force, switching the default branch, deleting the temporary short-history main,
and renaming the clean full-history branch to main.
