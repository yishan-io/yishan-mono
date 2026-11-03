# @yishan-io/pi-task

Pi tools and workflow skills for Local Tasks.

## Authority and runtime

The SQLite-backed Local Task daemon owns task metadata and status. Pi connects to the managed daemon through `YISHAN_DAEMON_WS_URL`. The package requires Node.js 22.4 or later.

The daemon generates UUIDs for new tasks. Imported task IDs remain opaque. Do not create, parse, or replace task IDs.

Local Task lifecycle states are `new`, `progressing`, `done`, and `cancelled`. New tasks start as `new`.

The package uses `YISHAN_PROJECT_ID` when it is set. Operations then use only that project. Without this value, new tasks are global. Lists and searches show only global tasks.

## Tools

The package registers exactly these ten tools:

- `task_start` creates a new task with a title, description or goal and acceptance criteria, priority, tags, and an optional workspace association.
- `task_link_workspace` associates an existing task with a workspace by opaque ID or exact key in the current project/global scope. It returns the canonical `id`, `workspaceId`, and `link`.
- `task_list` lists tasks by status, priority, workspace, and tags.
- `task_search` searches tasks with the same filters.
- `task_read` reads the synthetic, read-only task brief or a context document.
- `task_update` changes a title, description, new, progressing, or cancelled status, priority, or tags. It cannot set done.
- `task_write` replaces the `plan`, `notes`, or `outcome` context document.
- `task_append_note` adds text to `notes`.
- `task_finish` writes the outcome and marks a task done.
- `task_template_read` reads the Agent default task description template structure.

The synthetic brief shows daemon metadata. It is not a writable context document. The daemon provides paths for `plan`, `notes`, and `outcome`.

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

## Markdown conventions

For multi-step work, create tasks with an outcome-focused title, a concise goal, relevant context/background, and independently checkable acceptance criteria. Include context only when it explains why the work matters, records a binding decision, or states a constraint; keep changing research and implementation detail in `notes.md`, not in task metadata.

Use this editable notes structure by default:

```markdown
# Notes

## Summary

## Decisions

## Evidence and Progress

- YYYY-MM-DD — <fact, result, or change>

## Open Questions
```

Agents may append dated facts or replace the document to reorganize it. Users can edit the Markdown context documents directly.

Use `task_finish` only when the user explicitly asks to complete the task. When the user explicitly says all work is complete, run self-checks and finish without asking again.

## Development

```bash
bun run --cwd packages/pi-task typecheck
bun run --cwd packages/pi-task lint
bun run --cwd packages/pi-task test
cd packages/pi-task && npm pack --dry-run
```
