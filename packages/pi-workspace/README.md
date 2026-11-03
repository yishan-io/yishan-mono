# @yishan-io/pi-workspace

Pi workspace extension package for Yishan.

## What it provides

This package adds Pi-facing workspace lifecycle tools on top of the existing Yishan CLI.

Current MVP features:
- registers `workspace_list` backed by `yishan workspace list --output json`
- registers `workspace_find` backed by `yishan workspace find --output json`
- registers `workspace_create` backed by `yishan workspace create`
- registers `workspace_close` backed by `yishan workspace close --output json`
- defaults to `YISHAN_PROJECT_ID`, `YISHAN_WORKSPACE_ID`, and `YISHAN_ORG_ID` when tool arguments are omitted
- `workspace_create` defaults `sourceBranch` to `main` when omitted

## Installation

As a Pi package:

```bash
pi install /absolute/path/to/packages/pi-workspace
```

Or from a checked-out monorepo path:

```bash
pi install ./packages/pi-workspace
```

## Backend requirement

Workspace commands depend on the Yishan CLI and local daemon being available.

## Tools

| Tool | Purpose |
|---|---|
| `workspace_list` | List project workspaces |
| `workspace_find` | Look up one workspace by id |
| `workspace_create` | Create a worktree workspace |
| `workspace_close` | Close one workspace |

## Launch Work for an Existing Task

Only same-project Task delegation is supported. The target Pi inherits the workspace project, so it cannot read global or different-project tasks. Global tasks remain usable and linkable in global scope; linking does not grant target read access.

For a new workspace, keep the task as the source of requirements and context:

1. Use `task_start` to persist complete requirements, or reuse an existing Task ID. Save relevant notes and the controller-frozen plan before launch.
2. Use `task_read` with the original Task ID. Make sure its `projectId` is non-null and equals the target project before `workspace_create`. Resolve the target from an explicit projectId override, otherwise from the current `YISHAN_PROJECT_ID`. If either project is unknown, the task is global, the projects differ, or the read fails, stop. Do not create a workspace or start a run. This is not a retryable association failure. Do not recreate the Task or change scope to bypass the check.
3. Use `workspace_create` with a short intent-first `taskRunPrompt`, such as `Execute Task <Task ID>; first use task_read to read its requirements and context.` Do not embed full requirements or context.
4. Use `task_link_workspace` with the original Task ID and returned workspace ID. This only associates the task. It does not start another run.

New-workspace runs use fixed Pi through agent chat. Do not pass an agent kind or a Pi subagent definition. The target agent must use `task_read` for the explicit Task ID and existing notes/plan without waiting for association. Do not create a replacement task.

Only after the scope check passes and workspace creation succeeds, use association recovery. If association fails, keep the task and context. Retry only the association with the same Task ID and known workspace ID. Do not recreate the workspace or launch another run. Repeating the same pair returns the existing link. Associating another workspace keeps earlier associations and is not an atomic rebind.

After a creation timeout or a run failure, inspect workspace and run state before any retry. Do not retry automatically. Workspace creation alone does not prove that the agent chat started.

Keep the existing-workspace flow with `task_start.workspaceId` for non-primary workspaces. Do not automatically associate a task in the primary workspace. Do not inspect or modify the new workspace from the current session unless the user asks to move there. Do not close a workspace automatically after task completion. Completion and closure still require explicit user direction.

## Development

Package-local checks:

```bash
bun run --cwd packages/pi-workspace typecheck
bun run --cwd packages/pi-workspace lint
bun run --cwd packages/pi-workspace test
```

## License

MIT — see [LICENSE](./LICENSE).
