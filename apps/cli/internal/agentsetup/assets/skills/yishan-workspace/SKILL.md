---
name: yishan-workspace
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
- You need to close a workspace after completing a task
- You are unsure how to translate a task into the correct yishan workspace commands
- The user mentions branches, worktrees, or workspace lifecycle

## Prerequisites

The `yishan` CLI must be installed and authenticated. Verify with:

```bash
yishan whoami
```

If it fails, guide the user to run `yishan login` first.

## Node reference

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

1. **Install the CLI**: Follow the [install guide](https://github.com/yishan-io/yishan-mono?tab=readme-ov-file#yishan-cli).
   ```bash
   curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh
   ```

2. **Log in**:
   ```bash
   yishan login
   ```

3. **Set the active org**:
   ```bash
   yishan org list
   yishan org use <org-id>
   ```

4. **Find the project**:
   ```bash
   yishan project list
   ```

5. **Create the primary workspace** (a full checkout on this machine):
   ```bash
   yishan workspace create --project-id <project-id> --local-path /path/to/repo --kind primary
   ```

6. **Verify**:
   ```bash
   yishan workspace list --project-id <project-id>
   ```

After the primary workspace exists, worktree workspaces can be created for
individual feature branches (see the worktree section below).

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

### Create a primary workspace

A primary workspace is a full checkout of the project repo at a local path.
Create one first before creating worktree workspaces.

```bash
yishan workspace create \
  --project-id <project-id> \
  --local-path /absolute/path/to/repo \
  --kind primary
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

Start an agent in the workspace immediately after creation. The agent runs
in a terminal session with the given prompt as the initial task.

```bash
yishan workspace create \
  --project-id <project-id> \
  --kind worktree \
  --branch feature/my-branch \
  --source-branch main \
  --task-run-agent-kind opencode \
  --task-run-prompt "Implement the login page" \
  --task-run-model sonnet
```

Flags:
- `--task-run-agent-kind` — Agent binary to launch (opencode, claude, codex, pi, gemini, copilot, cursor)
- `--task-run-prompt` — Initial task prompt for the agent
- `--task-run-model` — Optional model override for the agent

### Close a workspace

```bash
yishan workspace close \
  --project-id <project-id> \
  --workspace-id <workspace-id>
```

## Workflow for agent tasks

### Starting a new feature

1. **Find the project**: Ask the user for the project name or ID. If unknown, run
   `yishan project list` and present options.

2. **Check for existing primary workspace**: Run
   `yishan workspace list --project-id <project-id>`. Look for an entry with
   `kind: "primary"` and a `localPath`. If one exists, note the path.

3. **Create primary if missing**: If no primary workspace exists on this node,
   create one. Ask the user for the repo path, or default to
   `~/yishan/<project-id>`.

4. **Create a worktree**: Determine a branch name from the task (agree with user).
   Then run the worktree create command. The output includes a `localPath` —
   navigate the agent to that directory.

   To also start an agent in the workspace immediately, add `--task-run-agent-kind`
   and `--task-run-prompt` to the create command. The workspace will open with
   the agent running the given prompt as its initial task.

### Finishing a task

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
- Worktree paths are deterministic: `~/yishan/<repo-key>/worktrees/<workspace-name>`.
- Always close workspaces after tasks — this cleans up git worktrees and releases server resources.
- The local daemon node is the default; no need to pass `--node-id` unless the user specifies a different node.
