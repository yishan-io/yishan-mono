---
name: ys-workspace
description: Quickly create and close Yishan workspaces for agent-driven development workflows.
metadata:
  tool: yishan
  scope: workspace-lifecycle
---

## What I do

I teach you how to use the `yishan` CLI to create and close workspaces. Use me
when you need to provision a new workspace for a feature task, or tear one down
after the work is complete.

## When to use me

- The user asks you to "create a workspace for ..." or "start working on ..."
- You need a fresh worktree to implement a feature or fix a bug
- You need to close a workspace after completing the work
- You are unsure how to translate a task into the correct yishan workspace commands
- The user mentions branches, worktrees, or workspace lifecycle

## Prerequisites

The `yishan` CLI must be installed and authenticated. Verify with:

```bash
yishan whoami
```

If it fails, guide the user to run `yishan login` first.

## Session environment

Every terminal session started by yishan has these variables in its environment.
Read them instead of hard-coding IDs or asking the user:

| Variable | Value |
|---|---|
| `YISHAN_WORKSPACE_ID` | Current workspace ID |
| `YISHAN_PROJECT_ID` | Project the workspace belongs to |
| `YISHAN_ORG_ID` | Organisation the workspace belongs to |
| `YISHAN_TAB_ID` | UI tab ID (used by hook notifications) |
| `YISHAN_PANE_ID` | UI pane ID (used by hook notifications) |

Example — pass the project ID directly without asking:
```bash
yishan workspace list --project-id "$YISHAN_PROJECT_ID"
yishan workspace close \
  --project-id "$YISHAN_PROJECT_ID" \
  --workspace-id "$YISHAN_WORKSPACE_ID"
```

## Workspace boundary rules

- The current agent session is bound to its current workspace. Do not switch this
  session into another workspace.
- If you create a workspace with `--task-run-agent-kind` and
  `--task-run-prompt`, that launches a separate agent terminal inside the new
  workspace. Treat that as a handoff, not a workspace switch for the current
  session.
- After creating a new workspace, do not read, edit, grep, glob, or run bash in
  the new workspace path from the current session unless the user explicitly
  asks to move this session there.
- Cross-workspace operations are not allowed. A session that started in the
  primary workspace must keep working in the primary workspace.
- After delegated workspace creation, report the created workspace details to the
  user and stop there unless they asked for follow-up work in the current
  workspace.



Workspace creation and closing only happens on the **current local node** (the
machine where the yishan daemon is running). You cannot create or close
workspaces on remote nodes — those operations must be performed from that node's
machine directly.

To see all nodes registered to the org:

```bash
yishan node list
```

Each node has an `id`, `scope` (private/shared), and `endpoint`. The local
daemon is always the default node — workspace commands will use it automatically
without needing to specify a node ID.

## Setting up the current workspace

If the user is new to yishan or hasn't set up their machine yet, guide them
through these steps in order:

1. **Make sure the CLI command is available**: Choose the setup path that
   matches the machine:

   - **Local desktop usage**: If the user is running Yishan Desktop on their
     own machine, use the desktop-managed CLI install. The desktop app can
     install a symlink to the bundled CLI at `~/.local/bin/yishan`.
   - **Remote host / daemon setup**: If the user is setting up Yishan on a
     remote machine that will run the daemon directly, the curl-based install
     flow is still valid there.

   `yishan setup` installs the managed agent and skill integrations after the
   CLI is available.

2. **Log in**:
   ```bash
   yishan login
   ```

3. **Set the active org**:
   ```bash
   yishan org list
   yishan org default --org-id <org-id>
   ```

4. **Find the project**:
   ```bash
   yishan project list
   ```

5. **Verify**:
   ```bash
   yishan workspace list --project-id <project-id>
   ```

A primary workspace is created automatically when the project is created.
Worktree workspaces can then be created for individual feature branches
(see the worktree section below).

## Commands reference

### List projects

```bash
yishan project list
```

Returns a list of projects with their IDs. Use `--output json` for machine parsing.

### List workspaces in a project

```bash
yishan workspace list --project-id <project-id>
```

### Find a specific workspace

```bash
yishan workspace find --project-id <project-id> --workspace-id <workspace-id>
```

### Create a worktree workspace

Worktree workspaces are git worktrees branched from a primary workspace.
Use these for isolated feature work.

```bash
yishan workspace create \
  --project-id <project-id> \
  --kind worktree \
  --branch feature/my-branch \
  --source-branch main \
  --name feature-my-branch
```

### Create a workspace with a task run

Start an agent in the workspace immediately after creation. The task content
should already exist in `.my-context/tasks/active/<id>-<slug>/task.md` — the
prompt is a short pointer to that file, not the full task description.

```bash
yishan workspace create \
  --project-id <project-id> \
  --kind worktree \
  --branch feature/my-branch \
  --source-branch main \
  --task-run-agent-kind opencode \
  --task-run-prompt "Read .my-context/tasks/active/<id>-<slug>/task.md and use ys-plan then ys-build to implement the task."
```

Flags:
- `--task-run-agent-kind` — Agent binary to launch (opencode, claude, codex, pi, gemini, copilot, cursor)
- `--task-run-prompt` — Short prompt (1-2 lines) directing the agent to the task file — NOT the full task description
- `--task-run-model` — Optional model override for the agent

### Close a workspace

```bash
yishan workspace close \
  --project-id <project-id> \
  --workspace-id <workspace-id>
```

## Workflow for agent tasks

### Starting a new feature

1. **Find the project**: Default to `YISHAN_PROJECT_ID` from the environment.
   Only ask the user for a project name/ID or run `yishan project list` if that
   variable is missing or the user explicitly wants a different project.
   Primary workspaces are created automatically when the project is created — no
   manual primary setup needed.

2. **Create the task in `.my-context/` first**: Use the `ys-start` skill to create
   the task folder under `.my-context/tasks/active/<id>-<slug>/` with `task.md`.
   This persists the task content on disk so it cannot be lost during workspace
   creation. Do NOT synthesize a large `--task-run-prompt`.

   If the user has not yet navigated a task, use `ys-start` now. If a task already
   exists, note its ID and path.

3. **Create the workspace**: Determine a branch name from the task (agree with user).
   Pass the task path as a short, stable prompt — the agent in the new workspace
   will read `task.md` and follow `ys-plan` / `ys-build` from there.

    ```bash
    yishan workspace create \
      --project-id <project-id> \
      --kind worktree \
      --branch feature/my-branch \
      --source-branch main \
      --name feature-my-branch \
      --task-run-agent-kind opencode \
      --task-run-prompt "Read .my-context/tasks/active/<id>-<slug>/task.md and use ys-plan then ys-build to implement the task."
    ```

4. **Return control to the user**: Share the created workspace ID, branch, and
   `localPath`, and state that the task was launched in a new terminal session.
   Do not inspect or modify that workspace from the current session.

### Finishing a task

Only close a workspace when the user explicitly asks to close it.

1. **Find the workspace**: Run `yishan workspace list --project-id <project-id>`
   and locate the workspace for the branch.

2. **Close the workspace**: Run the close command with the workspace ID.

3. **Confirm**: Verify with the user that the workspace was closed successfully.

## Error codes

When `yishan` exits non-zero, classify failures by the exit message:

| Code                | Meaning                                   |
|---------------------|-------------------------------------------|
| `daemon_not_running`| The yishan daemon is not running           |
| `validation_error`  | Input was invalid (check flags)            |
| `unauthenticated`   | Token expired — run `yishan login`         |
| `permission_denied` | Insufficient org/project role              |
| `not_found`         | Project or workspace does not exist        |
| `conflict`          | Workspace name/branch already exists       |
| `server_error`      | API returned 5xx — retry later             |

## Tips

- Use `--output json` for scriptable parsing.
- Worktree paths are deterministic: `~/.yishan/worktrees/<repo-key>/<workspace-name>`.
- Do not close a workspace automatically after a task. The user decides when to close it.
- The local daemon node is the default; no need to pass `--node-id` unless the user specifies a different node.
