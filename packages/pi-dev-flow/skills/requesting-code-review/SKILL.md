---
name: requesting-code-review
description: Use when finishing substantial code changes, before merging, or at natural checkpoints to request an explicit code review pass.
---

# Requesting Code Review

Use this skill to request a focused review before changes continue or ship.

## Core Principle

Review early enough to catch issues before they compound, and review with concrete scope.

## When to Use This Skill

Use this skill:

- After completing a substantial task or feature
- Before merging or handing work off
- After a complex bug fix or refactor
- At natural checkpoints in multi-step work
- When a fresh set of eyes would reduce risk

For tiny mechanical edits, a separate review pass is optional.

## What To Review

Prepare a tight review scope:

- What changed
- What behavior was intended
- What files or diff range matter
- What risks deserve attention

Good review requests are specific. Avoid asking for a vague review of the entire project when only one change matters.

## How to Request Review

### 1. Identify the review scope

Prefer one of these:

- Current uncommitted diff
- A specific commit range
- A completed task's touched files

If using commits, gather the relevant base and head SHAs.

### 2. Dispatch a review pass

Use the `code-reviewer` agent for read-only code review.

Include:

- A short summary of the change
- The intended behavior or requirements
- Any known risks or areas you are unsure about
- The files or diff range to inspect

Example request contents:

```text
Review this change for bugs, regressions, missing tests, and risky assumptions.

Summary: Added a new retry path for transient API failures.
Expected behavior: Requests retry once on network timeout, but not on validation errors.
Scope: diff between <base> and <head>.
Focus: error handling, duplicate side effects, and test coverage.
```

### 3. Act on the findings

- Fix high-severity issues first
- Fix medium-severity issues before treating the work as complete
- Decide whether low-severity items should be fixed now or noted for later
- If a finding seems wrong, verify it against the code and push back with evidence

## Review Cadence

For larger efforts:

- Review after meaningful checkpoints instead of waiting until the very end
- Avoid stacking multiple risky changes without feedback in between

For smaller efforts:

- One review near completion is usually enough

## Red Flags

Do not:

- Skip review just because the change feels simple
- Ask for review without stating the intended behavior
- Ignore serious findings and continue anyway
- Treat review as a formality instead of a real risk check

## Bottom Line

Request review with concrete scope, clear expectations, and enough context for someone to find real issues quickly.
