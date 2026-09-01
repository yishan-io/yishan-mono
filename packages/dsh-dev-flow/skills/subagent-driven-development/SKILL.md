---
name: subagent-driven-development
description: Use when executing a multi-task implementation plan with a fresh DSH subagent for each task, reviewing each task before moving on, and keeping controller context narrow.
---

# Subagent-Driven Development

Use this skill to execute an approved implementation plan with isolated subagents.

## Durable Context

When the work has a Local Task, use the native `task_*` tools as the controller's durable record.

- use `task_read` to load the task brief and relevant `plan` or `notes` documents
- keep the current plan in `plan` with `task_write`
- record task-specific discoveries with `task_append_note` or `task_write`
- use `task_finish` only when the user explicitly asks to complete the task

Use `memory_search` and `memory_read` when prior durable decisions, architecture notes, or cross-task discoveries may affect the plan or task sequencing. Use `memory_store` only for durable knowledge that belongs beyond the current task.

## Why This Skill Exists

The goal is to keep each subagent's context narrow so its decisions stay clear, reusable, and cheaper than carrying one large implementation session.

This workflow separates roles:

- controller: coordinates the plan and handoffs
- implementation subagent: implements one task
- review subagent: performs a read-only review of each completed task and the final broader change

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
3. Use the native `subagent` tool to execute one task at a time with a fresh implementation subagent
4. If the subagent returns `NEEDS_CONTEXT` or `BLOCKED`, resolve that before proceeding
5. Use a fresh review subagent for a read-only review of the completed task
6. If review finds important issues, use a fresh implementation subagent for a focused fix pass
7. Only mark the task complete once review is clean enough to proceed
8. After all tasks are done, use a fresh review subagent for a broader final pass
9. Complete tracked work with `task_finish` only when the user explicitly asks

If a Local Task exists, the controller should keep its `plan`, `notes`, and final state aligned with what the subagents actually discovered and completed.

## Controller Responsibilities

As the controller, keep your own context narrow too. Pass only what each agent needs:

- the task being worked on
- the relevant files or diff scope
- the constraints that bind that task
- the required verification steps

Do not paste large accumulated history into every dispatch.

When using a Local Task, the controller is also responsible for keeping its durable record coherent between handoffs rather than leaving progress only in subagent responses.

## Handoff Contract For An Implementation Subagent

When calling `subagent` for implementation, include:

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

## Handoff Contract For A Review Subagent

When calling `subagent` for a read-only review, include:

- the task text or brief
- the intended behavior
- any binding constraints
- the changed files or diff range
- the implementation subagent's summary of what changed and how it was verified

The review must answer two questions:

1. Did this task implement the right thing?
2. Is the result good enough to build on safely?

## Review Loop

If the review subagent returns Critical or Important issues:

- send the findings to a fresh implementation subagent
- keep the scope focused on the current task
- re-review after the fixes

Do not continue to the next task with open task-level issues that would make later work less reliable.

If review findings change the task understanding or remaining plan, update the Local Task `notes` or `plan` document with `task_append_note` or `task_write` before moving on.

## Final Review

After all tasks are complete:

- call `subagent` for a read-only review
- review the broader change as a whole
- resolve serious findings before treating the branch as done

## Progress Tracking

Track progress outside transient conversation memory.

At minimum, maintain:

- which task is currently active
- which tasks are complete
- which findings remain open

Use a file or durable task tracking when the plan is long enough that session compaction or interruption is realistic.

For tracked work, use the Local Task documents through `task_*` tools instead of ad hoc scratch notes.

## Model Strategy

One advantage of dedicated agents is stable per-role model control.

Suggested defaults:

- implementation subagent: cheaper or mid-tier model for scoped implementation work
- review subagent: stronger reasoning model than the implementation subagent for task and whole-change review

Adjust upward when a task is unusually complex.

## Red Flags

Do not:

- run multiple implementation subagents in parallel against the same checkout
- skip task review between meaningful tasks
- ignore `NEEDS_CONTEXT` or `BLOCKED`
- let controller context balloon with pasted diffs and old summaries
- move forward with unresolved Important or Critical review findings

## Bottom Line

This skill is about disciplined orchestration: one task, one fresh implementation subagent, one scoped review, then move on.

When the work is tracked, use `task_*` tools so the durable Local Task documents reflect reality at each checkpoint.
