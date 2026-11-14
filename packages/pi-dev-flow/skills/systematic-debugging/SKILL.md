---
name: systematic-debugging
description: Use when a failure has an unclear cause or attempted fixes do not work. Gather evidence and test hypotheses before changing behavior. A known, proven cause does not need a separate investigation phase.
---

# Systematic Debugging

Use evidence to locate the cause before fixing it. Scale the investigation to the uncertainty, not to a fixed checklist.

## Investigate

Read the error and relevant code. Reproduce the failure when practical, or use existing logs, traces, and recorded evidence. Check recent changes when they relate to the failure.

Form a concrete hypothesis and test it with the smallest useful check. If the cause is already proven, proceed to the fix without repeating the investigation.

For failures across components, inspect the relevant boundaries and find the first unexpected value or state. Do not instrument every layer when evidence already localizes the problem. Compare a working path when it helps test the hypothesis.

## Fix and Verify

Create a focused regression test when the behavior is testable. Use `test-driven-development` for a test-first fix. If automation is impractical, state the limitation and use a concrete reproduction or manual check.

Make the smallest change that addresses the cause. Run the reproduction and relevant surrounding checks. Do not combine unrelated speculative fixes.

## Keep the Investigation Bounded

Within the agreed task scope, the active agent can choose hypotheses, adjust tests, and perform local fixes. No separate controller brief is required for each attempt.

If repeated attempts add no evidence, stop and summarize what is known, what failed, and the next useful check. Set a concrete investigation limit for an uncertain or already prolonged investigation. Do not reset that limit merely to continue the same failed approach.

Escalate when the next step needs a new architectural decision, material scope expansion, unavailable access, or a user tradeoff. Do not escalate routine test or instrumentation adjustments.

For tracked work, record material findings and remaining uncertainty in task notes. Do not require a note or handoff for every hypothesis.

## Optional References

Read these only when relevant:

- `root-cause-tracing.md` for tracing a failure backward through a call chain
- `condition-based-waiting.md` for asynchronous or flaky tests
- `defense-in-depth.md` for preventing recurrence across relevant boundaries
