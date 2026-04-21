---
description: Create a GitHub issue using the repository Work Item template
allowed-tools: Bash(scripts/automation/create-work-item-issue.sh:*), Bash(gh issue create:*)
---

Create a GitHub issue that follows `.github/ISSUE_TEMPLATE/work-item.md`.

## Inputs

Parse `$ARGUMENTS` for:
- title
- type (`bug|feature|refactor|documentation|other`)
- summary
- acceptance criteria (one or more)
- optional context/scope/out-of-scope/validation/risks/additional/labels/assignees/repo

## Steps

1. Normalize user input into script flags.
2. If required fields are missing, ask only for missing fields.
3. Run:

```bash
scripts/automation/create-work-item-issue.sh [flags...]
```

4. Return the created issue URL and a short summary of populated fields.

$ARGUMENTS
