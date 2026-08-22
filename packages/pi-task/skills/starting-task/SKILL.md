---
name: starting-task
description: Use when new work may need a tracked Local Task before research, planning, or implementation.
---

# Starting Task

Use this skill to decide if work needs a Local Task.

The SQLite-backed Local Task daemon owns task metadata and status. Pi uses the managed daemon through its configured endpoint. The daemon generates UUIDs. Imported IDs stay opaque.

## Decision Rule

Create a task when one or more conditions apply:

- The work has multiple steps or files.
- The work can continue in another session.
- The work needs notes, a plan, or a completion record.
- The user asks to track the work.

Do not create a task for a small one-time edit or a question with no work.

## Start a Task

Use `task_start` with a concise title. Provide a description, or provide a goal and acceptance criteria. Do not provide both forms.

You can set priority and tags at creation. The daemon owns the active status. Do not provide an ID.

If `YISHAN_PROJECT_ID` is set, the task belongs to that project. Without it, the task is global.

## Work After Start

Use `task_read` for the synthetic, read-only brief. Use `task_update` to change metadata, active or paused status, priority, or tags. Use `task_list` or `task_search` to find tasks.

Use `task_write` for `plan`, `notes`, or `outcome`. Use `task_append_note` for task-specific discoveries.

Use `task_finish` only when the user explicitly asks to complete the task. It writes the outcome and completes the task.

## Boundaries

Do not create or parse task IDs. Do not bypass the daemon. Do not write the synthetic brief. Do not use `task_update` for completion.
