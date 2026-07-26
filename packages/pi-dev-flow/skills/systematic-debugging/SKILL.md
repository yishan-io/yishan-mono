---
name: systematic-debugging
description: Use when investigating a bug, test failure, build failure, flaky behavior, or unexpected runtime issue before proposing or implementing fixes.
---

# Systematic Debugging

Use this skill when something is broken and the cause is not yet proven.

## Core Principle

Do not jump to fixes before understanding the root cause.

Symptom-first fixes waste time, hide the real problem, and often create follow-up bugs.

## When to Use This Skill

Use this skill for:

- failing tests
- runtime bugs
- build or CI failures
- flaky behavior
- integration issues
- performance regressions with unclear cause

Use it especially when:

- the issue seems deceptively simple
- you are under time pressure
- you already tried one or two fixes
- the failure spans multiple components or layers

## The Rule

No fix before root-cause investigation.

If you have not yet reproduced the issue, collected evidence, and formed a concrete hypothesis, you are not ready to implement a fix.

## The Four Phases

### 1. Root-Cause Investigation

Before changing code:

- read the error message and stack trace carefully
- reproduce the issue consistently if possible
- identify what recently changed
- gather evidence at the component boundaries where things may be breaking
- trace bad values or bad state backward toward the source

If the issue appears deep in a call chain, read `root-cause-tracing.md` in this skill.

If the issue involves multiple layers, add targeted instrumentation so you can see where the breakdown begins.

### 2. Pattern Analysis

Before fixing:

- find a similar working example in the codebase
- compare working and broken behavior carefully
- list meaningful differences
- understand the dependencies and assumptions around the failing path

Do not half-copy patterns you have not fully read.

### 3. Hypothesis And Testing

Form one clear hypothesis at a time:

- what you think the root cause is
- why the evidence supports it
- what minimal test or check would confirm it

Then test only that hypothesis.

Do not stack multiple speculative fixes together.

### 4. Implementation

Once the root cause is identified:

1. create or isolate a failing reproduction
2. if possible, turn it into an automated failing test
3. implement the smallest fix that addresses the root cause
4. verify the reproduction is gone
5. verify you did not break surrounding behavior

For test-first fixes, use the local `test-driven-development` skill.

## If Repeated Fixes Fail

If two or three attempted fixes fail, stop assuming this is a small bug.

At that point, question:

- whether the architecture is wrong for this path
- whether the failure is a symptom of hidden coupling or invalid assumptions
- whether you are fixing effects instead of causes

Do not keep piling on fixes without rethinking the problem.

## Multi-Component Debugging

When debugging a chain like UI -> API -> service -> database or CI -> build -> packaging -> deploy:

- log what enters each boundary
- log what leaves each boundary
- verify the config and environment propagation layer by layer
- identify the first layer where reality diverges from expectation

This gives you evidence about where the system actually breaks.

## Related Local References

- `root-cause-tracing.md` - tracing failures backward to the source
- `defense-in-depth.md` - preventing the same class of bug at multiple layers
- `condition-based-waiting.md` - replacing timing guesses in flaky tests

## Ties To The Local Workflow

In this repo's workflow:

- use this skill before dispatching `builder` on a speculative bug fix
- if `builder` or a controller cannot explain the failure clearly, switch into debugging mode first
- use `task-reviewer` and `code-reviewer` to catch fixes that patched symptoms but missed the real issue

## Red Flags

Stop and reset if you catch yourself doing any of these:

- proposing a fix before reproducing the problem
- changing multiple variables at once
- saying "it is probably X" without evidence
- manually verifying a fix without a durable reproduction
- adding more logging and then not reading it carefully
- continuing after several failed fixes without rethinking the architecture

## Bottom Line

Systematic debugging means:

1. gather evidence
2. trace the root cause
3. test one hypothesis at a time
4. fix the actual source of failure

If you skip the investigation, you are guessing.
