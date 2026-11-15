---
name: code-review
description: Use to review substantial or high-risk changes, handle review feedback, or fulfill an explicit review request. Small low-risk changes can use self-review and focused validation.
---

# Code Review

Use review to find correctness problems and regressions. Do not turn review into repeated approval rounds or unrelated cleanup.

## Choose the Review Level

For small, low-risk changes, inspect the diff and run focused checks. A separate reviewer is optional.

For substantial changes, risky fixes, migrations, or an explicit review request, use the read-only `code-reviewer` agent. One independent pass near completion is usually enough. Add an intermediate pass only when a risky boundary affects later work.

## Request a Focused Review

Provide:

- Goal and Done when: the intended behavior and success criteria
- Out of scope: what the change was not supposed to touch
- The output of `git diff --stat` and the diff range
- The relevant constraints and known risks
- The verification results (exact commands) and gaps

Ask for bugs, regressions, missing coverage, and unsafe assumptions. Also ask the reviewer to list every changed file that the Goal does not explain, marked UNPLANNED. Do not ask for an unrestricted redesign or repeat completed reviews without a new risk.

Ask the reviewer to return each finding with a file and line, the failing scenario, and a severity of blocking or non-blocking. A finding without a concrete scenario is a question, not a defect.

## Evaluate Feedback

Read the findings and verify them against the code, tests, and project constraints. Review comments are claims to evaluate, not instructions to obey blindly.

Fix confirmed blocking defects within the requested scope. Explain disagreement with evidence. Clarify only the ambiguous finding, and continue independent fixes when safe.

Keep style preferences, speculative improvements, and unrelated refactors outside the current change. Record useful follow-ups without automatically creating new tasks or expanding the work.

## Verify and Finish

Run the checks affected by each fix. Request at most one follow-up review, focused on unresolved findings or risky fixes. A trivial, directly verifiable fix does not require another agent pass.

Hard limit: 2 independent review rounds per change. After round 2, if blocking findings remain, stop. Report each remaining finding with its evidence and the decision the user must make. Do not start a third round unless the user asks.

Handle each UNPLANNED file the reviewer lists: revert it, or explain it and ask the user.

Summarize resolved issues, remaining risks, and actual verification (exact commands and results). For tracked work, write the findings, your decision on each (fixed, rejected with evidence, deferred), and the verification result to the task notes. Review does not close a tracked Local Task. Task closure remains user-controlled.
