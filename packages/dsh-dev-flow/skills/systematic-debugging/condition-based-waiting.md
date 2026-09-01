# Condition-Based Waiting

Use this when a test or script waits for asynchronous work and currently relies on guessed timing.

## Core Principle

Wait for the condition you care about, not an arbitrary delay.

## Use This When

- tests use `sleep`, `setTimeout`, or fixed delays
- behavior is flaky under load or in CI
- asynchronous work completes at unpredictable speeds

## Prefer This Pattern

Instead of:

```ts
await new Promise((r) => setTimeout(r, 100))
```

Prefer:

```ts
await waitFor(() => resultIsReady())
```

## What To Wait For

- a state transition
- an event appearing
- a file existing
- a queue draining
- a record count reaching the expected threshold

## Rules

- poll at a reasonable interval
- always use a timeout with a useful error message
- re-read fresh state inside the polling loop
- only use fixed waits when the timing itself is what you are testing

If you truly need a fixed wait, document why the timing is part of the requirement.

## Why It Helps

Condition-based waiting reduces:

- flaky tests
- environment-specific timing failures
- unnecessary waiting time
- false assumptions about how long work "should" take
