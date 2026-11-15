---
name: executing-plans
description: Use when an approved plan is ready for execution in the current session. Do not add another planning, delegation, or approval phase unless a material decision remains.
---

# Executing Plans

Execute an approved plan in the current session. Related implementation and test work stays with the current agent by default.

## Load the Context

Read the plan and relevant notes. If a Local Task tracks the work, use `task_read` for its synthetic, read-only brief and context documents. Do not create a task merely because a plan exists.

The SQLite-backed Local Task daemon owns task metadata and status. New IDs are daemon-generated UUIDs. Imported IDs stay opaque. If `YISHAN_PROJECT_ID` is set, use only that project. Without it, use global tasks only.

## Execute

1. Before the first edit, restate in 3 lines the plan's Goal, Done when, and Out of scope. If the plan has a `NEEDS APPROVAL` decision that is not yet approved, stop and ask.
2. Implement each coherent behavior with its tests. Do not split tightly coupled work into extra handoffs.
3. After each plan step, run that step's verification command and write one line to the user: step done, result, next step.
4. Before reporting completion, run the plan's combined verification, then `git status` and `git diff --stat`. List every changed file with a reason. Mark files the plan did not list as UNPLANNED, and revert them or ask.

A short checklist with scope and verification is enough for ordinary work. No frozen brief is required for every step or test cycle.

Changing test cases and code inside the files the plan lists is routine. Touching a file the plan does not list, adding a dependency or abstraction, or changing behavior outside Done when is a scope change: stop and ask. If delegated, report it to the coordinating agent instead. Ask the user when a decision changes unapproved behavior, commitments, or tradeoffs.

If the same check fails 3 times, or a step takes more than 20 tool calls without a new finding, stop. Report what you tried and observed, and wait. Do not silently expand the task.

## Record the Result

For tracked work, write to the task at these moments: (a) when you start, the restated Goal, Done when, and Out of scope; (b) when you choose between approaches, the options, the choice, and the reason; (c) when a discovery changes the plan, what you found and what changed (also update the plan with `task_write`); (d) when a verification result is known, the exact command and its result; (e) at the end, Changed, Verified, Not verified, and Risks, plus the diff check. Use `task_append_note` for (a) to (d) and `task_write` for the plan and outcome. Each entry needs evidence such as file paths, command names, or error text. Do not record every tool call or red/green cycle.

Use `task_update` for metadata or new, progressing, or cancelled status. It cannot set done. Use `task_finish` only when the user explicitly requests task completion. After explicit completion direction, perform the checks and finish without asking again.

## Boundaries

Do not bypass the daemon, create or parse task IDs, or write the synthetic task brief. Do not change a delegated scope without coordination. Task closure remains under the user's explicit control.
