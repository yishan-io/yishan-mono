---
name: yishan-task
description: Use when work needs a tracked Yishan Local Task: creating, planning, recording notes, or finishing it with the `yishan task` CLI.
---

# Yishan Task

Track one unit of work as a Yishan Local Task with the `yishan task` CLI. The daemon owns task metadata and status. The task context has three documents: `plan`, `notes`, and `outcome`. Always add `--output json` when you parse the result.

## Scope

Every command needs an explicit scope. Inside a Yishan terminal, `YISHAN_PROJECT_ID` is already set and is used by default. Otherwise pass `--project-id <id>`. Pass `--global` only for a task that belongs to no project. A missing scope is a usage error (exit code 2). Never invent or guess an ID. Never switch scope to get around an error.

## Commands

- `yishan task start --title "<title>" --goal "<goal>" --acceptance-criterion "<check>" [--context "<text>"] [--priority low|medium|high] [--tag <tag>] [--workspace-id <id>]`: create a task. Pass `--workspace-id "$YISHAN_WORKSPACE_ID"` to link the current workspace when it is not the primary one.
- `yishan task list [--status ...] [--tag ...]` and `yishan task search "<query>"`: find tasks. Reuse an existing task instead of creating a duplicate.
- `yishan task read <id>`: print the task brief. Add `--document plan|notes|outcome` to read one context document.
- `yishan task update <id> [--title ...] [--description ...] [--priority ...] [--status new|progressing|cancelled] [--tag ...]`: change metadata. It can never set `done`.
- `yishan task write <id> --document plan|notes|outcome (--content "<text>" | --file <path> | --file -)`: replace a document. For long Markdown, write a file or use stdin. Do not escape it into one argument.
- `yishan task append-note <id> --content "<text>"`: append text to notes. Start it with the date (YYYY-MM-DD) and keep it factual.
- `yishan task link-workspace <id> --workspace-id <id>`: link a task to a workspace. It does not start a run.
- `yishan task finish <id> --outcome "<summary>"`: write the outcome, then mark the task done.

## Workflow

1. Check for an existing task with `task list` or `task search` before you create one.
2. Create the task with a clear goal and acceptance criteria. Set `--status progressing` when work starts.
3. Before a multi-step change, write the plan to `plan`. Each plan subtask needs scope, non-goals, an acceptance check, and a finite budget.
4. Record decisions and evidence with `append-note` as you go. Keep entries factual and specific to this task.
5. If you find something that changes the plan's scope, record it in notes and stop. Ask the user. Do not widen the plan silently.
6. Use `task finish` only when the user explicitly asks to complete the task, or has said all work is complete. Do not finish because the code appears done. Write a factual outcome. Do not claim checks you did not run.

## Failure handling

- Exit code 4 means not found. 5 means a restricted path. 7 means a server error. Report the message to the user.
- `task start` needs the running Yishan daemon and cloud key allocation. If it fails while offline or signed out, say so. Do not create a fake ID or edit task files by hand.
- `task finish` can report a partial success: the outcome is saved but the status update failed. Retry the same command. It repeats only the status update.
- Never edit files in the task-context directory directly. Use the commands above.
- Do not close a workspace unless the user asks.
