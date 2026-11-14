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

1. Check the approved scope and identify any unresolved material decision.
2. Implement each coherent behavior with its tests. Do not split tightly coupled work into extra handoffs.
3. Run focused checks as work progresses and relevant combined verification before reporting completion.
4. Update the plan and task notes at meaningful milestones or when discoveries affect remaining work.

A short checklist with scope and verification is enough for ordinary work. No frozen brief or execution budget is required for every step or test cycle. Use explicit handoff boundaries or investigation limits when risk warrants them.

Adjust local implementation details within the agreed scope. If delegated, report material scope or architecture changes to the coordinating agent before proceeding. Ask the user only when a decision changes unapproved behavior, commitments, or tradeoffs.

If repeated attempts produce no new evidence, stop and reassess. Do not repeat failed work indefinitely or silently expand the task.

## Record the Result

For tracked work, use `task_write` for the current plan, material notes, and factual outcome. Use `task_append_note` for milestone evidence. Include verification results, remaining issues, and limitations. Do not record every tool call or red/green cycle.

Use `task_update` for metadata or new, progressing, or cancelled status. It cannot set done. Use `task_finish` only when the user explicitly requests task completion. After explicit completion direction, perform the checks and finish without asking again.

## Boundaries

Do not bypass the daemon, create or parse task IDs, or write the synthetic task brief. Do not change a delegated scope without coordination. Task closure remains under the user's explicit control.
