---
name: pr-skill
description: Create pull requests using this repository's PR template, with mandatory issue linkage unless explicitly confirmed otherwise.
---

# PR Skill

Create PRs that follow `.github/pull_request_template.md`.
Implementation is shared in `scripts/automation/create-pr-from-template.sh`.

## Rules

1. PR must link an issue by default (`closes #<number>`).
2. If no issue exists, ask user confirmation first, then use:
- `--allow-no-issue`
- `--no-issue-reason "<reason>"`
3. Populate PR sections exactly as template headings.
4. Testing notes must be meaningful (not placeholder text).
5. Keep PR titles user-facing and release-note friendly.
6. Apply exactly one release-notes label for GitHub generated release notes.
7. Preferred labels: `release:feature`, `release:fix`, `release:improvement`, `release:docs`.
8. Use `skip-release-notes` only for internal-only changes.

## Release Label Mapping

- `feature` -> `release:feature`
- `bug` -> `release:fix`
- `documentation` -> `release:docs`
- `refactor`/`other` -> `release:improvement`

Use `--release-label <label>` to override or `--skip-release-notes` for internal-only changes.

## Command

```bash
scripts/automation/create-pr-from-template.sh \
  --title "feat: add release checklist panel" \
  --summary "Add a release checklist panel to centralize release readiness checks." \
  --type feature \
  --testing "Ran typecheck, lint, and targeted unit tests for the new panel state." \
  --issue 123 \
  --validated-typecheck \
  --validated-lint \
  --validated-test-unit \
  --updated-tests
```

Dry-run preview:

```bash
scripts/automation/create-pr-from-template.sh \
  --title "feat: add release checklist panel" \
  --summary "Add a release checklist panel to centralize release readiness checks." \
  --type feature \
  --testing "Manual smoke check in desktop settings." \
  --issue 123 \
  --dry-run
```
