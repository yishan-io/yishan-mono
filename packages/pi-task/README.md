# @yishan-io/pi-task

A Pi package for Yishan task workflow guidance and small task-file tools.

The package loads its workflow skills from `skills/` and registers six direct operations rooted at the active Pi project's `ctx.cwd`:

- `task_start` creates an active task folder, `task.md`, and state entry.
- `task_list` lists state entries.
- `task_read` reads one named task document.
- `task_write` replaces one named task document.
- `task_append_note` appends a dated entry to `notes.md`.
- `task_finish` writes `outcome.md` and moves an active task to completed state.

The package deliberately does not provide repository abstractions, journalling, locks, crash recovery, pagination, or reopening.

## Development

```bash
bun run --cwd packages/pi-task typecheck
bun run --cwd packages/pi-task lint
bun run --cwd packages/pi-task test
npm pack --dry-run --prefix packages/pi-task
```
