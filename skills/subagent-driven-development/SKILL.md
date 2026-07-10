---
name: subagent-driven-development
description: Use when executing a multi-task implementation plan by dispatching one fresh builder agent per task, reviewing each task before moving on, and keeping controller context narrow.
---

# Subagent-Driven Development

Use this skill to execute an approved implementation plan with isolated subagents.

## Relationship To Context Skills

When the work is tracked in `.my-context/tasks/`, use `context-task` as the controller's durable task record.

- read the task from `task.md`
- use `plan.md` as the current execution source of truth
- store task-specific discoveries in `notes.md`
- finish with `outcome.md` and completed task state

Use `context-memory` when prior durable decisions, architecture notes, or cross-task discoveries may affect the plan or task sequencing.

## Why This Skill Exists

The goal is to keep each subagent's context narrow so its decisions stay clear, reusable, and cheaper than carrying one large implementation session.

This workflow separates roles:

- controller: coordinates the plan and handoffs
- `builder`: implements one task
- `task-reviewer`: reviews one task before the next begins
- `code-reviewer`: performs the broader final code review

## When to Use This Skill

Use this skill when:

- you already have an approved implementation plan
- the plan has multiple tasks or checkpoints
- tasks are independent enough to execute sequentially with clean handoffs
- you want stronger context isolation between implementation and review

Do not use this skill when the work is tiny, highly exploratory, or too tightly coupled to split into task handoffs.

## Core Workflow

1. Read the plan once and identify all tasks
2. Check for obvious contradictions or missing constraints before starting
3. Execute one task at a time with a fresh `builder` agent
4. If `builder` returns `NEEDS_CONTEXT` or `BLOCKED`, resolve that before proceeding
5. Review the completed task with `task-reviewer`
6. If review finds important issues, dispatch a fix pass back through `builder`
7. Only mark the task complete once review is clean enough to proceed
8. After all tasks are done, run a broader `code-reviewer` pass

If a `.my-context` task exists, the controller should keep `plan.md`, `notes.md`, and final task state aligned with what the subagents actually discovered and completed.

## Controller Responsibilities

As the controller, keep your own context narrow too. Pass only what each agent needs:

- the task being worked on
- the relevant files or diff scope
- the constraints that bind that task
- the required verification steps

Do not paste large accumulated history into every dispatch.

When using `.my-context/tasks/`, the controller is also responsible for keeping the durable task record coherent between handoffs rather than leaving progress only in agent responses.

## Handoff Contract For `builder`

When dispatching `builder`, include:

- task name or number
- exact task text or task brief
- where the task fits in the plan
- any required interfaces or prior-task outputs
- constraints that matter for this task
- verification commands or expected checks

Expect one of these statuses back:

- `DONE`
- `DONE_WITH_CONCERNS`
- `NEEDS_CONTEXT`
- `BLOCKED`

Treat any non-`DONE` status as a real signal, not noise.

## Handoff Contract For `task-reviewer`

When dispatching `task-reviewer`, include:

- the task text or brief
- the intended behavior
- any binding constraints
- the changed files or diff range
- the `builder` summary of what changed and how it was verified

The review must answer two questions:

1. Did this task implement the right thing?
2. Is the result good enough to build on safely?

## Review Loop

If `task-reviewer` returns Critical or Important issues:

- send the findings back through `builder`
- keep the scope focused on the current task
- re-review after the fixes

Do not continue to the next task with open task-level issues that would make later work less reliable.

If review findings change the task understanding or remaining plan, update `notes.md` or `plan.md` through `context-task` before moving on.

## Final Review

After all tasks are complete:

- dispatch `code-reviewer`
- review the broader change as a whole
- resolve serious findings before treating the branch as done

## Progress Tracking

Track progress outside transient conversation memory.

At minimum, maintain:

- which task is currently active
- which tasks are complete
- which findings remain open

Use a file or durable task tracking when the plan is long enough that session compaction or interruption is realistic.

For tracked work, prefer the `.my-context` task folder as that durable record instead of ad hoc scratch notes.

## Model Strategy

One advantage of dedicated agents is stable per-role model control.

Suggested defaults:

- `builder`: cheaper or mid-tier model for scoped implementation work
- `task-reviewer`: stronger reasoning model than `builder`
- `code-reviewer`: stronger reasoning model for whole-change review

Adjust upward when a task is unusually complex.

## Red Flags

Do not:

- run multiple builder tasks in parallel against the same checkout
- skip task review between meaningful tasks
- ignore `NEEDS_CONTEXT` or `BLOCKED`
- let controller context balloon with pasted diffs and old summaries
- move forward with unresolved Important or Critical review findings

## Bottom Line

This skill is about disciplined orchestration: one task, one fresh builder, one scoped review, then move on.

When the work is tracked, pair that orchestration with `context-task` so the durable task files reflect reality at each checkpoint.
