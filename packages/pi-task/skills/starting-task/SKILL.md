---
name: starting-task
description: Use when outcome-oriented engineering work may need a tracked Local Task before planning or implementation.
---

# Starting Task

Use this skill to decide if work needs a Local Task.

The SQLite-backed Local Task daemon owns task metadata and status. Pi uses the managed daemon through its configured endpoint. The daemon generates UUIDs. Imported IDs stay opaque.

## Decision Rule

Create Local Tasks for independently meaningful, outcome-oriented engineering work:

- Bug fixes
- Features
- Refactors
- Improvements to reliability, performance, UX, or maintainability
- Migrations, security work, or investigations with a durable conclusion

Before automatically creating a task, confirm all of these:

- The request is not merely an operational action or a question.
- It has a concrete, independently meaningful outcome that can be stated and verified.
- It needs durable tracking because it may span sessions or needs a plan, tests, decisions, or acceptance criteria.

Do not create a task merely because work has multiple steps or touches multiple files. Do not create one for operational requests, even when they have several steps: `git rebase`, commit, push, branch switching, checking status, running a known command, or a small one-time edit.

Routine initial reading or investigation is not a task by itself. If it reveals a distinct outcome-oriented work item, create a task then. When uncertain, do not create a task. Reuse a related active task instead of creating a duplicate.

Always create a task when the user explicitly asks to track the work.

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

Before creating a task automatically (without explicit user direction), call `task_template_read` to read the Agent default section structure. Use those headings and their order when writing the task description. Fall back to the built-in structure (## Goal, ## Context, ## Acceptance Criteria, ## Notes) only when the tool is unavailable.

Include context/background when it is known and materially affects the work; omit it rather than inventing history. Keep detailed research logs and changing decisions out of the task description. Put them in `notes` after task creation. The user can update task metadata with `task_update` at any time.

You can set priority and tags at creation. New tasks start with new status. Do not provide an ID.

Use `workspace_list` before `task_start` to resolve the current workspace. Use `YISHAN_WORKSPACE_ID` when it is set. Otherwise, select the workspace whose `localPath` matches the current worktree path. When that workspace is non-primary, pass its ID as `workspaceId`. Do not associate a task started in the primary workspace.

For an existing target workspace, keep the `task_start.workspaceId` flow. For a new target workspace, persist the task first as described below.

If `YISHAN_PROJECT_ID` is set, the task belongs to that project. Without it, the task is global.

## Delegate to a New Workspace

Only same-project Task delegation is supported. The target Pi inherits the workspace project, so it cannot read global or different-project tasks. Global tasks remain usable and linkable in global scope; linking does not grant target read access.

Keep the original task as the source of requirements and context:

1. Use `task_start` to persist the complete requirements and acceptance criteria. Reuse an existing Task ID instead of creating a duplicate.
2. Use `task_write` to save relevant `notes` and the controller-frozen `plan` before launch. Do not replace an existing plan without controller authority.
3. Use `task_read` with the original Task ID. Make sure its `projectId` is non-null and equals the target project before `workspace_create`. Resolve the target from an explicit projectId override, otherwise from the current `YISHAN_PROJECT_ID`. If either project is unknown, the task is global, the projects differ, or the read fails, stop. Do not create a workspace or start a run. This is not a retryable association failure. Do not recreate the Task or change scope to bypass the check.
4. Use `workspace_create` with a short intent-first `taskRunPrompt`, such as `Execute Task <Task ID>; first use task_read to read its requirements and context.` Do not embed the requirements or context. New-workspace runs use fixed Pi through agent chat. Do not pass an agent kind or a Pi subagent definition.
5. Use `task_link_workspace` with that Task ID and the returned workspace ID. This only associates the task. It does not create a task, update metadata, write context, or start a run.

The target agent must use `task_read` with the explicit Task ID, then read existing `notes` and `plan` without waiting for association. Do not create a replacement task if the association is not ready. The run can begin before the caller associates the workspace.

A repeated association of the same pair returns the existing link. Associating another workspace does not remove earlier associations. This is not an atomic rebind.

Only after the scope check passes and workspace creation succeeds, use association recovery. If association fails, keep the task and all context. Retry only `task_link_workspace` with the same Task ID and known workspace ID. Do not recreate the workspace or launch another run.

After a creation timeout or a run failure, inspect the workspace and run state before any retry. Do not retry automatically. A successful workspace creation response alone does not prove that the agent chat started.

Keep the existing-workspace flow: resolve the current workspace with `workspace_list`, using `YISHAN_WORKSPACE_ID` or the matching `localPath`. For a non-primary workspace, `task_start.workspaceId` still associates the new task at creation. Do not automatically associate a task in the primary workspace. Do not finish a task or close a workspace without explicit user direction.

## Work After Start

A tracked Local Task may contain multiple independently deliverable plan subtasks in its `plan.md`. A plan subtask is an execution unit within the tracked Local Task; its independent deliverability does not by itself require a new Local Task.

Use a plan proportional to the uncertainty and risk. Ordinary changes need only a short checklist and verification method. A tracked task does not require separate frozen briefs or budgets for every step.

Adjust implementation and test details within the agreed scope. Record material discoveries in `notes` and keep the plan current at meaningful milestones. For delegated work, report material scope or architecture changes to the coordinating agent before proceeding. Ask the user when a change affects unapproved behavior, commitments, or tradeoffs. Keep unrelated work separate rather than expanding the active task.

Use `task_read` for the synthetic, read-only brief. Use `task_update` to change metadata, new, progressing, or cancelled status, priority, or tags. It cannot set done. Use `task_list` or `task_search` to find tasks.

Use `task_write` for `plan`, `notes`, or `outcome`. Use `task_append_note` for task-specific discoveries.

Use `task_finish` only when the user explicitly asks to complete the task. It writes the outcome and marks the task done.

## Boundaries

Do not create or parse task IDs. Do not bypass the daemon. Do not write the synthetic brief. Do not use `task_update` for completion.
