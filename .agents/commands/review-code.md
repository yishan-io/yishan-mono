---
description: Review current change set and report high-confidence findings first
allowed-tools: Bash(scripts/automation/collect-review-context.sh:*), Read, Grep
---

Perform a code review for the requested range.

## Inputs

Parse `$ARGUMENTS` for optional:
- `base_ref`
- `head_ref`

Default:
- `base_ref=origin/main`
- `head_ref=HEAD`

## Steps

1. Collect review context:

```bash
scripts/automation/collect-review-context.sh <base_ref> <head_ref>
```

2. Review changed files in passes:
- correctness/regression
- security/data safety
- test coverage/edge cases
- API/contract compatibility

3. Output findings first, ordered by severity (`high`, `medium`, `low`) with confidence score.
4. Include open questions and residual risks.

$ARGUMENTS
