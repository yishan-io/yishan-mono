---
name: ys-tasks
description: Manage personal tasks in .my-context/tasks/. Use when asked to create a task, look up a task, do research for a task, plan a task, or complete a task.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I manage `.my-context/tasks/` — a personal task workspace that persists across
agent sessions. Each task gets its own folder where you can accumulate research,
build a plan, and record what was done. A `state.json` index lets you and the
agent track status at a glance.

`.my-context/` is personal and never committed. It is excluded from git
automatically by yishan.

## When to use me

- Creating a new task or piece of work
- Looking up what tasks are active or what was done on a task
- Doing research or investigation for a task — record findings in `notes.md`
- Planning how to execute a task — write a plan in `plan.md`
- Completing a task — move it to `completed/` and write `outcome.md`
- Asking "what am I working on?" or "what did I do on task X?"

## Folder structure

```
.my-context/tasks/
  state.json                 — task index (source of truth for status)
  active/
    <id>-<slug>/
      task.md                — goal, ticket reference, acceptance criteria
      notes.md               — research, findings, open questions (append-only)
      plan.md                — execution plan (created when planning is done)
  completed/
    <id>-<slug>/
      task.md
      notes.md
      plan.md
      outcome.md             — what was actually done and what changed
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
- `created` — ISO date
- `path` — path relative to project root (update when task is completed and folder moves)

Rules:
- Always read `state.json` before any task operation.
- Always write `state.json` after any task operation that changes status or adds a task.
- Do not remove entries when completing — update `status` to `"completed"` and update `path`.

## File contents

### task.md

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
```

### notes.md

Append-only. Add findings, dead ends, open questions, links. Never rewrite —
accumulate. The agent should add to this file whenever research or investigation
produces something worth remembering.

```markdown
# Notes: <title>

## YYYY-MM-DD

<finding, question, or dead end>
```

### plan.md

Created only when actively planning execution. Rewrite freely as the plan evolves.

```markdown
# Plan: <title>

_Last updated: YYYY-MM-DD_

## Approach

<High-level approach and why>

## Steps

1. <step>
```

### outcome.md

Written when completing a task. Summarises what was actually done.

```markdown
# Outcome: <title>

**Completed:** YYYY-MM-DD

## What was done

<Summary of changes made>

## What changed

<Files, configs, behaviour that is different now>

## Notes for the future

<Anything useful to know if this area is touched again>
```

## Workflows

### Creating a task

1. Read `state.json` (create it if missing — `{ "tasks": [] }`).
2. Determine the ID: use the ticket ID if provided, otherwise generate a short random ID.
3. Build the folder name: `<id>-<slug>`.
4. Create `.my-context/tasks/active/<folder>/task.md`.
5. Add the entry to `state.json` and write it.
6. Confirm the task was created and show its path.

### Researching / taking notes

1. Find the task folder from `state.json`.
2. Append to `notes.md` (create it if missing) with today's date as a heading.
3. Do not edit previous notes entries.

### Planning a task

1. Find the task folder from `state.json`.
2. Read `task.md` and `notes.md` for context.
3. Write or update `plan.md`.

### Completing a task

1. Read `state.json` and find the task entry.
2. Write `outcome.md` in the task folder.
3. Move the folder from `active/` to `completed/`.
4. Update the entry in `state.json`: set `status` to `"completed"`, update `path`.
5. Write `state.json`.

### Listing tasks

Read `state.json` and display active tasks. For detail on a specific task,
read its `task.md` and optionally `notes.md` and `plan.md`.
