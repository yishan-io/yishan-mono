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

Every handoff must contain all of these fields. Do not paste the entire session history.

- Goal: the outcome wanted, in one or two sentences.
- Done when: checkable success criteria, including the exact verification command.
- Out of scope: files, behavior, and refactors the agent must not touch.
- Files: the files to read first and the files it may edit.
- Stop rule: return `BLOCKED` if the same check fails 3 times, or after 20 tool calls on one sub-problem without a new finding. Do not keep trying.
- Report format: Changed (files and behavior), Verified (exact commands and results), Not verified, Risks, and any file edited outside the "may edit" list.

The executor can adjust test cases and local implementation inside the "may edit" files. Editing any other file, adding a dependency, a new abstraction, or a behavior change not in Done when requires returning `NEEDS_CONTEXT` first.

Treat `NEEDS_CONTEXT` and `BLOCKED` as decisions to resolve. Do not blindly redispatch. Redispatch only with new information in the handoff. Do not dispatch the same scope more than twice.

After every delegation returns, the coordinating agent must run `git status` and `git diff --stat` itself. Compare the result with the "may edit" list. Do not rely on the subagent's report alone. Revert or ask about any unplanned file.

## Parallel Work

Run scopes concurrently only when they do not depend on each other or share mutable state. File separation alone does not prove independence. Do not run concurrent builders against shared files, Git state, or test fixtures.

Use background runs only when useful non-overlapping work can continue. Wait for completion events rather than polling. After results arrive, check for conflicting conclusions or edits and run the relevant combined verification.

## Review

Use `code-review` to choose review scope and timing. Do not require a separate review after every subtask. For a substantial change, one independent review near completion is usually enough. Add an intermediate review only when a risky interface or decision would affect later work.

Verify the combined result before reporting completion. A previous scoped review does not replace integration checks, and a final review does not need to repeat every scoped review.

## Progress and Long-Running Work

For an existing tracked Local Task, write to it at the Task record moments in the system instructions: when delegating (the handoff and the reason), when a result changes the plan, and when verification results are known. Do not write after every tool call or test cycle. Task closure remains user-controlled.

While a delegation runs, the coordinating agent posts a user-facing line when it starts (who, what scope) and when it returns (result in 1–2 lines). If a background run has produced no event for a long time, tell the user what it is doing and whether you are waiting or stopping it.

For resident or long-running operations, define a progress signal, an observation trigger, and a condition for stopping or escalation. Do not leave an operation running without an observable state or a next decision point.
