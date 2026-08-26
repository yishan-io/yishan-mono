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

Use `task_start` with an outcome-focused title. Prefer separate `goal`, `context`, and independently checkable `acceptanceCriteria` fields for multi-step work; use `description` only when a short free-form brief is clearer. Do not provide both forms.

Use this concise creation shape when the information is known; omit sections that would be speculation:

```text
Title: <verb> <observable outcome>
Goal: <one-sentence outcome>
Context / background: <why this work matters, prior decisions, or constraints>
Acceptance criteria:
- <verifiable result>
- <verifiable result>
```

Include context/background when it is known and materially affects the work; omit it rather than inventing history. Keep detailed research logs and changing decisions out of the task description. Put them in `notes` after task creation. The user can update task metadata with `task_update` at any time.

You can set priority and tags at creation. New tasks start with new status. Do not provide an ID.

Use `workspace_list` before `task_start` to resolve the current workspace. Use `YISHAN_WORKSPACE_ID` when it is set. Otherwise, select the workspace whose `localPath` matches the current worktree path. When that workspace is non-primary, pass its ID as `workspaceId`. Do not associate a task started in the primary workspace.

For delegated work, associate the task with an existing target workspace. If no target workspace exists, use `workspace_create` first, then pass its returned workspace ID to `task_start`.

If `YISHAN_PROJECT_ID` is set, the task belongs to that project. Without it, the task is global.

## Work After Start

When a new issue appears during a workspace task, decide whether it is related. Incorporate related work into the current task. Otherwise, ask the user whether to create a separate task.

Use `task_read` for the synthetic, read-only brief. Use `task_update` to change metadata, new, progressing, or cancelled status, priority, or tags. It cannot set done. Use `task_list` or `task_search` to find tasks.

Use `task_write` for `plan`, `notes`, or `outcome`. Use `task_append_note` for task-specific discoveries.

Use `task_finish` only when the user explicitly asks to complete the task. It writes the outcome and marks the task done.

## Boundaries

Do not create or parse task IDs. Do not bypass the daemon. Do not write the synthetic brief. Do not use `task_update` for completion.
