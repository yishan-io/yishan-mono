---
name: context-task
description: Use when work needs a tracked Local Task during research, planning, execution, review, or user-directed completion.
---

# Context Task

Use this skill to keep one Local Task accurate. The SQLite-backed Local Task daemon owns task metadata and status. Pi uses the managed daemon through its configured endpoint.

New tasks receive daemon-generated UUIDs. Imported IDs stay opaque. Do not create, parse, or replace an ID.

Project scope uses `YISHAN_PROJECT_ID`. If it is set, use only that project. Without it, use global tasks only.

## Task Metadata

Use `task_read` without a document to read the synthetic, read-only brief. The brief contains daemon metadata. Use `task_update` to change the title, description, new, progressing, or cancelled status, priority, or tags. It cannot set done.

Use `task_list` to filter by status, priority, workspace, or tags. Use `task_search` to search with those filters. `task_finish` is the only tool that can set done.

When a new issue appears during a workspace task, decide whether it is related. Incorporate related work into the current task. Otherwise, ask the user whether to create a separate task.

## Context Documents

The daemon provides the paths for three context documents:

- `plan` contains the current execution plan.
- `notes` contains task-specific research and decisions.
- `outcome` contains a factual completion summary.

Use `task_write` to replace `plan`, `notes`, or `outcome`. Use `task_append_note` to add research or progress to `notes`. Keep the plan coherent. Keep notes specific to this task.

## Completion

Use `task_finish` only when the user explicitly asks to complete the task. After explicit direction that all work is complete, perform the self-checks, prepare a factual outcome, and finish without asking again. The tool writes the outcome and marks the task done.

Do not complete a task because implementation appears complete.

## Boundaries

Do not bypass the daemon. Do not create task identifiers. Do not write the synthetic brief. Do not use `task_update` for completion.
