# Repository reset

`github-repository-reset.mjs` separates an old GitHub repository from a clean
replacement without force-pushing rewritten history.

The old repository becomes a private archived backup under a new name. The
replacement uses the original name and receives one parentless root commit.
Pull requests, issues, releases, branches, tags, and old commit ancestry are not
copied into the replacement.

## Safety model

- Process exactly one explicitly selected repository per invocation.
- Keep the manifest, keyword configuration, state, and audit output outside the
  repository.
- Require a clean local worktree and zero forbidden references.
- Refuse to overwrite an existing clean backup branch.
- Never use force push or mirror push.
- Require `--apply` for mutation and exact `--confirm owner/name` for migration.
- Verify that the replacement has a distinct GitHub repository ID.
- Make the renamed backup private before archiving it.

The migration phase changes external GitHub state and is not automatically
rolled back after a partial API failure. Retain the external state file, inspect
both repository names, and use the exact-confirmation `resume` command after
fixing the failure. Do not restart `migrate` after the old repository was
renamed.

## Workflow

Copy `github-repository-reset.example.json` to a secure external path and edit
the repository entry. Create a separate external leak-checker keyword file.

```powershell
node scripts/github-repository-reset.mjs plan `
  --manifest <external-manifest>

node scripts/github-repository-reset.mjs prepare `
  --manifest <external-manifest> `
  --repository <owner/name> `
  --keywords-file <external-keywords> `
  --state <external-state> `
  --apply

node scripts/github-repository-reset.mjs migrate `
  --manifest <external-manifest> `
  --repository <owner/name> `
  --state <external-state> `
  --confirm <owner/name> `
  --apply

# Only after a partially completed migrate:
node scripts/github-repository-reset.mjs resume `
  --manifest <external-manifest> `
  --repository <owner/name> `
  --state <external-state> `
  --confirm <owner/name> `
  --apply
```

`prepare` pushes the parentless snapshot to the configured clean branch on the
old repository. `migrate` renames the old repository, creates the replacement,
pushes that same root commit to `main`, and only then makes the backup private
and archived.

After migration, old local clones must not push to the original repository URL.
Re-clone the replacement or deliberately realign local branches to its new root
commit.
