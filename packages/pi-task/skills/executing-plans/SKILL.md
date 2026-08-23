---
name: executing-plans
description: Use when you have an approved plan and can execute it in the current session without the full subagent workflow.
---

# Executing Plans

Use this skill to execute an approved plan in the current session.

The SQLite-backed Local Task daemon owns task metadata and status. Pi uses the managed daemon through its configured endpoint. New tasks use daemon-generated UUIDs. Imported IDs stay opaque.

## Load the Task

Use `task_read` for the synthetic, read-only brief. Read `plan` and `notes` when they are relevant. Use `task_list` or `task_search` to find work by status, priority, workspace, or tags.

If `YISHAN_PROJECT_ID` is set, work only with that project. Without it, work only with global tasks.

## Execute the Plan

1. Read the plan before you edit.
2. Perform one plan task at a time.
3. Run its focused verification.
4. Record material discoveries in `notes`.

When a new issue appears during a workspace task, decide whether it is related. Incorporate related work into the current task. Otherwise, ask the user whether to create a separate task.

Use `task_write` to replace `plan` when the execution plan changes. Use `task_append_note` to add task-specific research or progress. Use `task_update` for a title, description, active or paused status, priority, or tags.

`task_update` cannot complete a task. Use `task_finish` only when the user explicitly asks to complete the task. When the user explicitly says all work is complete, run the self-checks and finish without asking again. It writes `outcome` and completes the task.

## Boundaries

Do not bypass the daemon. Do not create or parse task IDs. Do not write the synthetic brief. Stop and reassess when the plan no longer fits the work.
