---
name: subagent-driven-development
description: Use when independent research, isolated implementation, or specialist review benefits from subagents. Do not dispatch one agent per plan step by default.
---

# Subagent-Driven Development

Use subagents when isolation, specialist knowledge, or parallel work saves more effort than the handoff costs. The current agent handles related implementation work by default.

## Choose a Useful Boundary

Good delegation scopes include:

- Independent research that returns evidence and relevant file paths
- A self-contained implementation with clear interfaces and verification
- Specialist review of a substantial or high-risk change

Do not delegate trivial reads, quick searches, or tightly coupled steps that need the same working context. Do not split implementation from its tests merely to create more dispatches.

Use `explore` for read-only research, `builder` for implementation, and `code-reviewer` for code review. A fresh builder is not required for every plan step. Do not repeat work already delegated.

## Handoff

Provide the goal, scope, relevant files, constraints, expected result, and verification method. Include explicit non-goals or an investigation limit when the work risks expanding or repeating failed attempts. Do not paste the entire session history.

The executor can adjust implementation details and test cycles within the assigned scope. A new architectural decision, unapproved behavior change, or material scope expansion requires a report to the coordinating agent.

Treat `NEEDS_CONTEXT` and `BLOCKED` as decisions to resolve. Do not blindly redispatch. If attempts produce no new evidence, stop and reassess rather than increasing the retry count.

## Parallel Work

Run scopes concurrently only when they do not depend on each other or share mutable state. File separation alone does not prove independence. Do not run concurrent builders against shared files, Git state, or test fixtures.

Use background runs only when useful non-overlapping work can continue. Wait for completion events rather than polling. After results arrive, check for conflicting conclusions or edits and run the relevant combined verification.

## Review

Use `code-review` to choose review scope and timing. Do not require a separate review after every subtask. For a substantial change, one independent review near completion is usually enough. Add an intermediate review only when a risky interface or decision would affect later work.

Verify the combined result before reporting completion. A previous scoped review does not replace integration checks, and a final review does not need to repeat every scoped review.

## Progress and Long-Running Work

For an existing tracked Local Task, update its plan and notes after material discoveries or milestones. Do not write a document after every tool call or test cycle. Record the result and remaining issues in the outcome. Task closure remains user-controlled.

For resident or long-running operations, define a progress signal, an observation trigger, and a condition for stopping or escalation. Do not leave an operation running without an observable state or a next decision point.
