# Testing Anti-Patterns

Load this reference when writing tests, introducing mocks, or considering test-only production hooks.

## Core Principle

Test real behavior, not mock behavior.

Mocks are tools for isolation. They are not the thing you are trying to prove.

## Anti-Pattern 1: Testing Mock Behavior

Bad pattern:

- asserting that a mock rendered
- asserting that a fake test element exists instead of checking the real behavior

Why this is bad:

- it proves the mock is present, not that the system works
- it creates false confidence

Preferred fix:

- test the real component or real behavior
- if mocking is necessary, assert on the caller's behavior, not the mock's existence

## Anti-Pattern 2: Test-Only Methods In Production Code

Bad pattern:

- adding methods, branches, or options that only tests use

Why this is bad:

- production code gets polluted by test concerns
- ownership boundaries become unclear
- accidental runtime misuse becomes easier

Preferred fix:

- move cleanup and helpers into test utilities
- keep production interfaces focused on production behavior

## Anti-Pattern 3: Mocking Without Understanding Dependencies

Bad pattern:

- mocking a high-level method before understanding what side effects the real method provides

Why this is bad:

- the test may stop exercising the behavior it depends on
- failures become confusing and misleading

Preferred fix:

- understand what the real dependency does first
- mock the narrow external or slow edge, not the behavior under test
- if unsure, run with the real implementation first and then mock minimally

## Anti-Pattern 4: Incomplete Mocks

Bad pattern:

- creating partial fake objects that only include fields the current assertion touches

Why this is bad:

- downstream code may rely on omitted structure
- tests can pass while real integrations fail

Preferred fix:

- mirror the full relevant shape of the real data
- base mocks on real docs, schemas, or known examples

## Anti-Pattern 5: Tests As An Afterthought

Bad pattern:

- implementation finished first, tests added later only for reassurance

Why this is bad:

- passing tests do not prove they would have caught the bug or missing behavior
- edge cases are chosen after the fact, biased by the implementation

Preferred fix:

- return to red-green-refactor
- make the failing test the driver of the behavior change

## Warning Signs

- mock setup is larger than the actual test logic
- removing the mock breaks the meaning of the test
- you cannot explain why the mock is necessary
- you are adding production methods only used by tests
- the test is mostly scaffolding and barely checks behavior

## Practical Rule

Before introducing a mock, ask:

1. What real behavior am I trying to prove?
2. What dependency am I isolating?
3. Am I asserting on the system's behavior, or on the mock itself?

If the answer is "the mock itself," the test is probably wrong.

## Bottom Line

Mocks should support the test, not become the subject of the test.
