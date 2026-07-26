---
name: executing-plans
description: Use when you have an approved implementation plan and want to execute it directly in the current session without the full subagent-driven workflow.
---

# Executing Plans

Use this skill to execute a written implementation plan directly in the current session.

## Relationship To Context Skills

When work is tracked, use `context-task` as the durable execution-record policy and `pi-task` tools for task-record operations:

- use `task_read` for the brief, plan, and prior notes
- use `task_append_note` for task-specific discoveries and progress
- use `task_write` (`document: "plan"`) when a material course correction changes the coherent plan
- use `task_write` (`document: "task"`) for stable task metadata or relevant PR references

Use `context-memory` only for durable cross-task facts or decisions.

## Why This Skill Exists

This is the lighter-weight alternative to `subagent-driven-development`: execute a plan in one session without per-task builder and reviewer dispatches. Use the subagent workflow when stronger context isolation and review gates are needed.

## When to Use This Skill

Use it when the plan is approved, clear enough to execute directly, and moderate in size or tightly coupled. Do not use it when the work is highly parallelizable, benefits from strict per-task isolation, or needs repeated review gates.

## Workflow

### 1. Load and review the plan

Before editing, read the plan carefully and check for contradictions, missing prerequisites, or unclear steps. For tracked work, read the task brief, plan, and relevant notes with `task_read`. Do not treat a plan as automatically correct just because it exists.

### 2. Track execution

Identify each plan task, keep one task in progress at a time, and regard a plan task as complete only after its verification passes. For tracked work, record meaningful progress and discoveries with `task_append_note` rather than relying on transient chat history.

### 3. Execute one task at a time

For each task:

1. understand the scope
2. perform the listed implementation steps
3. run its verification
4. confirm the result before moving on

Record material discoveries and revise the full plan with `task_write` (`document: "plan"`) when needed. Do not skip ahead merely because later work seems related.

### 4. Handle problems explicitly

Stop and reassess if the plan is missing detail, verification repeatedly fails, the codebase conflicts with the plan, or a task reveals that the plan structure is wrong. Ask for clarification or revise the plan instead of forcing through blockers.

### 5. Final validation

After implementation tasks are verified, run broader relevant checks, confirm the implementation still meets the plan goal, and request review when substantial or risky.

Do not call `task_finish` merely because all implementation tasks are complete. Finish is a separate explicit-user-directed workflow through `finishing-task`.

## Red Flags

Do not:

- start implementation before reviewing the plan
- skip task-level verification
- continue through repeated failures without reassessing
- silently change the plan's intent
- manipulate task files or state directly
- finish a tracked task without explicit user direction

## Bottom Line

Review first, execute task by task, verify continuously, and retain durable task-specific progress without automatically changing task lifecycle state.
