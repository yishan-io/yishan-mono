---
name: finishing-task
description: Use only when the user explicitly asks to complete a tracked Local Task and the task needs a durable outcome.
---

# Finishing Task

Use this skill only when the user explicitly asks to complete a Local Task.

The SQLite-backed Local Task daemon owns task metadata and status. Pi uses the managed daemon through its configured endpoint. The daemon generates UUIDs. Imported IDs stay opaque.

## Preconditions

Before completion, make sure that:

- The requested work is implemented.
- Relevant verification passes.
- Important review feedback is resolved or accepted.
- The plan and notes contain useful task history.
- The outcome states only delivered work.

Use `task_read` for the synthetic, read-only brief. Use `task_list` or `task_search` to locate the task. Project scope uses `YISHAN_PROJECT_ID`. Without it, use global tasks only.

Use `task_update` for title, description, active or paused status, priority, or tags. It cannot complete a task.

## Prepare the Outcome

Write a concise factual outcome. Include delivered behavior, meaningful files or configuration changes, and follow-up work when needed.

Use `task_write` for `plan`, `notes`, or `outcome`. Use `task_append_note` for task-specific facts. Do not write the synthetic brief.

## Complete the Task

After the user explicitly directs completion, use `task_finish` with the factual outcome. The tool writes `outcome` and completes the task.

## Boundaries

Do not complete a task without explicit user direction. Do not bypass the daemon. Do not create or parse task IDs. Do not use `task_update` for completion.
