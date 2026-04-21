---
description: Create a GitHub PR from the repository template with required issue linkage by default
allowed-tools: Bash(scripts/automation/create-pr-from-template.sh:*), Bash(gh pr create:*)
---

Create a pull request that follows `.github/pull_request_template.md`.

## Inputs

Parse `$ARGUMENTS` for:
- title
- summary
- type (`bug|feature|refactor|documentation|other`)
- testing notes
- issue number (preferred)
- optional base/head/repo/draft

## Issue policy

- Require an issue by default.
- If no issue exists, ask for explicit user confirmation, then pass:
  - `--allow-no-issue`
  - `--no-issue-reason "<reason>"`

## Step

Run:

```bash
scripts/automation/create-pr-from-template.sh [flags...]
```

$ARGUMENTS
