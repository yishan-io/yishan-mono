---
name: test-driven-development
description: Use when implementing a feature, bug fix, or behavior change where automated tests should drive the implementation before production code is written.
---

# Test-Driven Development

Use this skill when writing or changing behavior that should be protected by tests.

## Core Principle

Write the test first. Watch it fail for the expected reason. Then write the smallest production change that makes it pass.

If you did not observe the failure before implementation, you do not know whether the test proves the behavior you care about.

## When to Use This Skill

Use this skill for:

- new features
- bug fixes
- refactors that affect behavior
- changes to validation, parsing, state transitions, or side effects

Usually skip this only for:

- throwaway prototypes
- purely mechanical configuration edits
- generated code

If in doubt, prefer TDD.

## The Rule

No production code for a new behavior without a failing test first.

If code was already written for the behavior and no failing test came first, do not pretend it was TDD. Either backfill tests consciously or restart the change with an actual red-green-refactor cycle.

## Red-Green-Refactor

### 1. RED

Write one focused failing test that demonstrates the next behavior you want.

Good tests are:

- focused on one behavior
- named clearly
- checking real behavior, not test scaffolding
- as small as possible while still meaningful

### 2. VERIFY RED

Run the focused test and confirm:

- it fails
- it fails for the expected reason
- it fails because the behavior is missing or wrong, not because the test itself is broken

If the test passes immediately, it is not proving the missing behavior.

### 3. GREEN

Write the smallest production change that makes the failing test pass.

Do not:

- add unrelated features
- refactor broadly before reaching green
- over-generalize beyond what the test requires

### 4. VERIFY GREEN

Run the focused test again and confirm it passes.

Then run the broader relevant test scope and confirm you did not break existing behavior.

### 5. REFACTOR

After reaching green:

- improve naming
- remove duplication
- simplify structure

Do not change behavior while refactoring. Keep the tests green.

## Quality Bar For Tests

Prefer tests that:

- verify real behavior instead of mocks
- use mocks only when isolation is necessary
- express the intended API or user-visible behavior
- cover edge cases that are easy to miss

If you are about to add mocks, complex test doubles, or test-only hooks, read `testing-anti-patterns.md` in this skill first.

## Bug Fixes

For a bug fix:

1. Write a failing test that reproduces the bug
2. Watch it fail
3. Fix the bug with the smallest correct change
4. Re-run the test and relevant surrounding tests

Do not fix the bug first and add the test later while calling it TDD.

## TDD In The Local Workflow

In this repo's agent workflow:

- `builder` should follow TDD whenever the task involves behavior changes that are testable
- `task-reviewer` should treat missing test-first discipline as a real quality concern when the task clearly called for it
- `code-reviewer` can treat weak or suspicious test coverage as a merge risk

When dispatching `builder`, include the expected verification commands so the red and green steps are concrete.

## Common Failure Modes

- test written after implementation
- test passes immediately
- test fails for the wrong reason
- assertion checks mock behavior instead of real behavior
- production code gains test-only methods or branches
- broad code changes happen before a small failing test exists

These are signals to slow down and tighten the loop.

## Verification Checklist

Before calling a TDD-driven task complete, confirm:

- a failing test existed first for each new behavior
- the failure was observed and understood
- the implementation was the smallest correct step to green
- the focused test passes
- the broader relevant test scope passes
- the output is clean enough to trust

## Bottom Line

TDD is not "tests eventually." It is a sequence:

1. write the failing test
2. observe the failure
3. write minimal code to pass
4. verify and refactor safely

If you skip the failure-first step, you are no longer doing TDD.
