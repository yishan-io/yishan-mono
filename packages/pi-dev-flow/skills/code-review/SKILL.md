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

- The intended behavior or requirements
- The changed files or diff range
- The relevant constraints and known risks
- The verification results and gaps

Ask for bugs, regressions, missing coverage, and unsafe assumptions. Do not ask for an unrestricted redesign or repeat completed reviews without a new risk.

## Evaluate Feedback

Read the findings and verify them against the code, tests, and project constraints. Review comments are claims to evaluate, not instructions to obey blindly.

Fix confirmed blocking defects within the requested scope. Explain disagreement with evidence. Clarify only the ambiguous finding, and continue independent fixes when safe.

Keep style preferences, speculative improvements, and unrelated refactors outside the current change. Record useful follow-ups without automatically creating new tasks or expanding the work.

## Verify and Finish

Run the checks affected by each fix. Request at most one follow-up review, focused on unresolved findings or risky fixes. A trivial, directly verifiable fix does not require another agent pass.

If blocking findings remain, report the evidence and the remaining decision. Do not keep looping until a reviewer returns no comments. Further rounds need a concrete new scope or reason, not a desire for a clean verdict.

Summarize resolved issues, remaining risks, and actual verification. Review does not close a tracked Local Task. Task closure remains user-controlled.
