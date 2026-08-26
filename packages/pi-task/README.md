# @yishan-io/pi-task

Pi tools and workflow skills for Local Tasks.

## Authority and runtime

The SQLite-backed Local Task daemon owns task metadata and status. Pi connects to the managed daemon through `YISHAN_DAEMON_WS_URL`. The package requires Node.js 22.4 or later.

The daemon generates UUIDs for new tasks. Imported task IDs remain opaque. Do not create, parse, or replace task IDs.

Local Task lifecycle states are `new`, `progressing`, `done`, and `cancelled`. New tasks start as `new`.

The package uses `YISHAN_PROJECT_ID` when it is set. Operations then use only that project. Without this value, new tasks are global. Lists and searches show only global tasks.

## Tools

The package registers exactly these eight tools:

- `task_start` creates a new task with a title, description or goal and acceptance criteria, priority, tags, and an optional workspace association.
- `task_list` lists tasks by status, priority, workspace, and tags.
- `task_search` searches tasks with the same filters.
- `task_read` reads the synthetic, read-only task brief or a context document.
- `task_update` changes a title, description, new, progressing, or cancelled status, priority, or tags. It cannot set done.
- `task_write` replaces the `plan`, `notes`, or `outcome` context document.
- `task_append_note` adds text to `notes`.
- `task_finish` writes the outcome and marks a task done.

The synthetic brief shows daemon metadata. It is not a writable context document. The daemon provides paths for `plan`, `notes`, and `outcome`.

Use `task_finish` only when the user explicitly asks to complete the task. When the user explicitly says all work is complete, run self-checks and finish without asking again.

## Development

```bash
bun run --cwd packages/pi-task typecheck
bun run --cwd packages/pi-task lint
bun run --cwd packages/pi-task test
cd packages/pi-task && npm pack --dry-run
```
