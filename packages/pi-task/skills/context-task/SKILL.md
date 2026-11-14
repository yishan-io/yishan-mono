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

A tracked Local Task may contain multiple independently deliverable plan subtasks. A plan subtask is an execution unit within the tracked Local Task; its independent deliverability does not by itself require a new Local Task.

Adjust implementation details within the agreed scope without a new approval round. Record discoveries that materially affect the remaining work and update the plan. For delegated work, report material scope or architecture changes to the coordinating agent before proceeding. Ask the user when a change affects unapproved behavior, commitments, or tradeoffs. Keep unrelated issues out of the active work and offer follow-up tracking only when useful.

## Context Documents

The daemon provides the paths for three context documents:

- `plan` contains the current execution plan.
- `notes` contains task-specific research and decisions.
- `outcome` contains a factual completion summary.

Keep the plan proportional to the work. A short checklist with scope and verification is enough for ordinary changes. Add detailed handoff boundaries or investigation limits only when delegation or risk requires them. Tracking a task does not require a frozen brief or budget for every step.

Use `task_write` to replace `plan`, `notes`, or `outcome`. Keep the plan aligned with the agreed scope. Delegated executors must not change assigned scope without the coordinating agent's decision. Use `task_append_note` for material discoveries or milestones, not every tool call or test cycle. Keep notes specific to this Local Task.

Start a new `notes` document with this compact, editable Markdown structure:

```markdown
# Notes

## Summary

## Decisions

## Evidence and Progress

- YYYY-MM-DD — <fact, result, or change>

## Open Questions
```

Append dated, factual entries under **Evidence and Progress**. Move resolved material into **Summary** or **Decisions** when it becomes important. Do not preserve an old format for its own sake: when the user asks to change the notes, replace or reorganize the Markdown with `task_write`. Users can also edit `notes.md` directly in the file editor.

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

## Completion

Use `task_finish` only when the user explicitly asks to complete the task. After explicit direction that all work is complete, perform the self-checks, prepare a factual outcome, and finish without asking again. The tool writes the outcome and marks the task done.

Do not complete a task because implementation appears complete.

## Boundaries

Do not bypass the daemon. Do not create task identifiers. Do not write the synthetic brief. Do not use `task_update` for completion.
