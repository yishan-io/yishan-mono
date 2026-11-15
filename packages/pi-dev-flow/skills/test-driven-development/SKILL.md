---
name: test-driven-development
description: Use for testable behavior changes and bug fixes where a failing test can guide implementation. Do not require a test-first ceremony for documentation, generated code, or changes without meaningful automated coverage.
---

# Test-Driven Development

For testable behavior, prefer a failing test before the production change. Use the test to demonstrate the missing behavior and protect against regressions.

## Red, Green, Refactor

1. Write a focused test for the next behavior or bug reproduction.
2. Run it and confirm that it fails for the expected reason, not broken test setup. Keep the command and the key line of the failure output as evidence.
3. Make the smallest production change that passes the test.
4. Run the focused test again.
5. Refactor only where useful, keeping the test green.

Run relevant surrounding tests after the coherent behavior change is green. Run broader checks at integration or completion, not after every assertion or tiny edit. After a refactor, rerun the affected tests.

If the test passes before the fix, examine whether it exercises the failure. Do not add an artificial failure just to complete the sequence.

## Local Autonomy

The implementing agent owns test cases and local red/green iterations inside the files in scope. A frozen controller brief is not required for each cycle.

If the same test is still red after 3 fix attempts, stop guessing and switch to `systematic-debugging`. Do not edit the test to make it pass unless you can state why the test, not the code, was wrong. Editing a source file outside the agreed scope to get a test green is a scope change: ask first.

## When Test-First Is Not Useful

Documentation, generated files, mechanical configuration edits, and throwaway prototypes usually do not need this workflow. Use the relevant validation instead.

If a meaningful automated test requires disproportionate infrastructure or unavailable dependencies, explain the limitation and use an appropriate check. Do not add production-only test hooks to satisfy the workflow.

If implementation already exists, add or strengthen coverage where needed. State that tests were added afterward. Do not restart correct work merely to claim TDD.

## Test Quality

Test observable behavior. Use mocks only where isolation requires them. Read `testing-anti-patterns.md` before introducing complex doubles or test-only hooks.

For a bug fix, prefer a regression test that fails on the old implementation and passes on the fix. Report what was tested, the exact commands and results (the red result and the green result), and any gaps. For tracked work, put the red and green results in the task notes at the verification moment, not per cycle.

Review correctness and regression coverage. Missing test-first evidence alone is not a blocking code defect.
