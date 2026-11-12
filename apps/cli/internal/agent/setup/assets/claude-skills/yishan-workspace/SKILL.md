---
name: yishan-workspace
description: Use when you need to list, find, create, or close Yishan workspaces (git worktrees) with the `yishan workspace` CLI.
---

# Yishan Workspace

A Yishan workspace is a git worktree inside a project. Use the `yishan workspace` CLI. Add `--output json` when you parse the result.

Inside a Yishan terminal these variables are already set: `YISHAN_PROJECT_ID`, `YISHAN_ORG_ID`, `YISHAN_WORKSPACE_ID`. Pass them as `--project-id` and `--workspace-id` when a command needs them. Never guess an ID.

## Commands

- `yishan workspace list --project-id "$YISHAN_PROJECT_ID"`: list the project's workspaces. Without `--project-id` it lists workspaces across all projects.
- `yishan workspace find --project-id "$YISHAN_PROJECT_ID" --workspace-id <id>`: show one workspace, including its path.
- `yishan workspace create --project-id "$YISHAN_PROJECT_ID" --branch <new-branch> --source-branch <base> [--name <name>]`: create a worktree on a new branch.
- `yishan workspace close --project-id "$YISHAN_PROJECT_ID" --workspace-id <id>`: close a workspace and stop its processes.

## Rules

- Create a workspace only when the user wants isolated work. Use a short, descriptive branch name.
- Do not use `--task-run-prompt` or `--task-run-model` unless the user asks. A task run in a new workspace starts a Pi agent, not Claude Code.
- To link work to a task, run `yishan task link-workspace <task-id> --workspace-id <id>` (see the `yishan-task` skill).
- Close a workspace only when the user explicitly asks. Never close it automatically after a task is done. Never close the workspace you are running in.
- After `create`, do not edit files in the new workspace from this session unless the user asks you to move there.
