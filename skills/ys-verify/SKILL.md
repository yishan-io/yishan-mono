---
name: ys-verify
description: Verify task completion. Review code for issues, run lint checks, and ensure all tests pass.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I verify that the built task meets its acceptance criteria and is free of
regressions. I do a code review, run lint checks, run the full test suite,
and flag any issues before the task is finalized.

Use me after `ys-build` and before `ys-done`.

## When to use me

- All build steps are complete and tests pass
- The user asks you to "verify", "check", or "review" the work
- Before finalizing a task with `ys-done`

## Verification checklist

Run through every item. Do not skip.

### 1. Acceptance criteria

- Read `task.md` — every acceptance criterion must be satisfied.
- If any are not met, return to `ys-build` to address them.

### 2. Code review

- Review all changed files (`git diff` or `git status`).
- Look for:
  - Dead code or commented-out blocks
  - Over-engineering: duplicate sources of truth, speculative abstractions, config nobody sets, or layers with one caller
  - Hand-rolled standard-library or platform behavior that should be replaced with the built-in equivalent
  - Dependencies or helper modules used for one trivial behavior the language or platform already provides
  - Longer code paths that can be safely shrunk without changing behavior
  - Missing error handling
  - Hardcoded values that should be configurable
  - Logging of secrets or sensitive data
  - Race conditions (Go goroutines without exit conditions)
  - Missing cleanup (subscriptions, intervals, file handles)
  - Violations of the coding guide (`docs/coding-guide.md`)
- Prefer deleting complexity over adding more structure. If you find over-engineering, cut it before sign-off.
- Flag any issues found and fix them.

### 3. Lint and typecheck

Run the project's lint and typecheck commands:

```bash
# TypeScript
bun run lint
bun run typecheck

# Go
go vet ./...
```

Fix all warnings and errors. Do not proceed with failures.

### 4. Tests

Run the full test suite:

```bash
# TypeScript
bun run test

# Go
go test ./...
```

All tests must pass. If any fail, fix them before proceeding.

### 5. Checklist summary

Write a verification summary at the bottom of `notes.md`:

```markdown
## YYYY-MM-DD — Verification

- [x] All acceptance criteria met
- [x] Code review — no issues (or list issues found & fixed)
- [x] Lint — clean
- [x] Typecheck — clean
- [x] All tests pass
```

## Workflow

1. Read `task.md` for acceptance criteria.
2. Run `git diff` or `git status` to see all changes.
3. Review each changed file for issues.
4. Run lint and typecheck commands.
5. Run the full test suite.
6. Write the verification checklist to `notes.md`.
7. If all checks pass, suggest the next step: `ys-done`.
8. If any check fails, fix the issues and re-verify.
