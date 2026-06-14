---
name: ys-done
description: Finalize a completed task. Update architecture docs, move the task to completed/, and ensure all PRs are merged.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I finalize a completed task. I write `outcome.md`, update any outdated
architecture docs in `.my-context/architecture/`, add new architecture docs
if structural changes were made, ensure all PRs are merged, and move the task
folder to `tasks/completed/`.

Use me after `ys-verify` as the final step in the task workflow.

## When to use me

- Verification is complete and all checks pass
- The user says the task is "done", "finished", or "complete"
- All PRs have been merged and the task needs archiving

## Prerequisites

- All verification checks in `ys-verify` must pass.
- All PRs should be merged (confirm with user).
- `task.md`, `notes.md`, and `plan.md` should all exist in the task folder.
- If PRs were created, list their URLs in `task.md` under a `## PRs` section.

## outcome.md template

Written when finalizing. Summarizes what was actually done.

```markdown
# Outcome: <title>

**Completed:** YYYY-MM-DD

## PRs

- <url> — <brief description>
- <url> — <brief description>

## What was done

<Summary of changes made>

## What changed

<Files, configs, behaviour that is different now>

## Notes for the future

<Anything useful to know if this area is touched again>
```

## Architecture doc rules

After completing a task, check if `.my-context/architecture/` needs updates:

1. **New component / module** → Add a new architecture doc describing the component,
   its responsibilities, and how it fits into the system.
2. **Changed behavior** → Update the relevant architecture doc(s) to reflect the
   new behavior. Use `yishan memory search` to find docs mentioning the changed area.
3. **New flow / process** → Document it with Mermaid diagrams (following the
   convention in existing architecture docs).
4. **No structural change** → No architecture update needed.

Search for affected docs:
```bash
yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<component-name>"
```

## Workflow

### Finalizing a task

1. Read `.my-context/tasks/state.json` to find the task entry.
2. Read `task.md` to confirm what was planned.
3. Collect all PR URLs — check `task.md` (## PRs section) or ask the user.
4. Write `outcome.md` using the template above:
   - **PRs** — list every PR URL with a brief description of what it covers.
   - **What was done** — concrete summary of changes.
   - **What changed** — specific files, configs, or behaviors.
   - **Notes for the future** — gotchas, follow-ups, or reminders.
5. Ensure all PRs are merged (confirm with user if unsure).
6. Check architecture docs:
   a. Search `.my-context/` for relevant architecture docs:
      ```bash
      yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<keywords>"
      ```
   b. Read docs that cover the changed area.
   c. Update outdated docs or add new ones as needed.
7. Move the task folder from `active/` to `completed/`:
   ```bash
   mv .my-context/tasks/active/<folder> .my-context/tasks/completed/<folder>
   ```
   Create `completed/` directory if it doesn't exist.
8. Update the entry in `state.json`: set `status` to `"completed"`, update `path` to
   `.my-context/tasks/completed/<folder>`.
9. Write `state.json`.
10. Update `.my-context/MEMORY.md`:
    - **Where I Left Off** — rewrite to reflect completion.
    - **My Decisions** — add any decisions made during the task.
    - **What I Learned** — add any non-obvious discoveries.
11. Report completion to the user.
