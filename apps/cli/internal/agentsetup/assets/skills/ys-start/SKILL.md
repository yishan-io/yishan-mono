---
name: ys-start
description: Start a new task in .my-context/tasks/. Create a ticket folder with task.md and register it in state.json.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I create a new task folder under `.my-context/tasks/active/` and register it in
`state.json`. This is the first step in the task workflow — after this, use
`ys-research` to investigate, then `ys-plan`, `ys-build`, `ys-verify`, and
finally `ys-done` to complete the task.

`.my-context/` is personal and never committed. It is excluded from git
automatically by yishan.

## When to use me

- The user asks to create a new task or track a piece of work
- A ticket (GitHub, Linear, Jira) needs a local task folder
- Before starting any of the other task workflow skills

## Session environment

Every terminal session started by yishan has these variables in its environment:

| Variable | Value |
|---|---|
| `YISHAN_PROJECT_ID` | Project the workspace belongs to |

## Folder structure

```
.my-context/tasks/
  state.json                 — task index (source of truth for status)
  active/
    <id>-<slug>/
      task.md                — goal, ticket reference, acceptance criteria
```

## Task IDs

- If the task has a ticket ID (e.g. from Linear, Jira, GitHub): use it as-is — `PROJ-123`
- If there is no ticket: generate a short random ID — 3 lowercase letters + 2 digits, e.g. `xkf42`
- Folder name is always `<id>-<slug>` where slug is the title lowercased, spaces replaced with hyphens, truncated to 40 chars — e.g. `PROJ-123-fix-auth-token-expiry`

## state.json format

```json
{
  "tasks": [
    {
      "id": "PROJ-123",
      "title": "Fix auth token expiry bug",
      "status": "active",
      "created": "2026-06-11",
      "path": ".my-context/tasks/active/PROJ-123-fix-auth-token-expiry"
    }
  ]
}
```

Fields:
- `id` — ticket ID or generated short ID
- `title` — one-line description
- `status` — `"active"` or `"completed"`
- `created` — ISO date (YYYY-MM-DD)
- `path` — path relative to project root

Rules:
- Always read `state.json` before any task operation. Create it as `{ "tasks": [] }` if missing.
- Always write `state.json` after creating a task.
- Never remove entries — update `status` and `path` instead.
- If `state.json` already exists outside `.my-context/tasks/` (legacy location), read from there but write to `.my-context/tasks/state.json`.

## task.md template

Written when the task is created. Update it if the goal or criteria changes.

```markdown
# <title>

**ID:** <id>
**Ticket:** <url or "none">
**Created:** YYYY-MM-DD
**Status:** active

## Goal

<What needs to be done and why>

## Acceptance Criteria

- <criterion>

## PRs

<!-- Add PR URLs as they are created during ys-build -->
- <url> — <brief description>
```

## Workflow

### Creating a task

1. Read `.my-context/tasks/state.json` (create it if missing — `{ "tasks": [] }`).
2. Ask the user for: title, ticket URL/ID (optional), and acceptance criteria.
3. Determine the ID: use the ticket ID if provided, otherwise generate a short random ID.
4. Build the folder name: `<id>-<slug>` (slug = title lowercased, spaces→hyphens, ≤40 chars).
5. Create the folder: `.my-context/tasks/active/<folder>/`.
6. Write `task.md` using the template above.
7. Add entry to `state.json`:

```json
{
  "id": "<id>",
  "title": "<title>",
  "status": "active",
  "created": "<YYYY-MM-DD>",
  "path": ".my-context/tasks/active/<folder>"
}
```

8. Write `state.json`.
9. Report the task path to the user and suggest the next step: `ys-research`.
