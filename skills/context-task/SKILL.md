---
name: context-task
description: Use when working with `.my-context/tasks/`, including finding the active task, reading or updating `task.md`, `notes.md`, `plan.md`, `outcome.md`, or maintaining `state.json` during planning, execution, review, and completion.
---

# Context Task

Use this skill when the current work is tracked in `.my-context/tasks/` and you need to read or update that task state correctly.

## Why This Skill Exists

This skill does not define a separate development workflow.

It defines how task context is persisted while using the current workflow skills and agents.

Use it together with:

- `writing-plans`
- `executing-plans`
- `subagent-driven-development`
- `requesting-code-review`

Those skills define how to work. This skill defines where task state lives and how to keep it consistent.

## When To Use This Skill

Use this skill when:

- the work is associated with a `.my-context/tasks/` task folder
- you need to locate the current task from `state.json`
- you need to read or update `task.md`, `notes.md`, `plan.md`, or `outcome.md`
- you need to create a task folder for newly tracked work
- you need to move a task from active to completed

Do not use this skill for durable cross-task knowledge. Use `context-memory` for that.

## Core Principle

`.my-context/tasks/` is the durable record of one tracked work item.

- `task.md` defines the goal
- `notes.md` captures research and discoveries for this task
- `plan.md` captures the current execution plan
- `outcome.md` summarizes what actually happened once the task is done
- `state.json` is the source of truth for task status and folder location

## Folder Structure

```text
.my-context/
  tasks/
    state.json
    active/
      <id>-<slug>/
        task.md
        notes.md
        plan.md
    completed/
      YYYY/
        MM/
          <id>-<slug>/
            task.md
            notes.md
            plan.md
            outcome.md
```

Some tasks may not have every file yet. Create the missing file only when the workflow needs it.

## `state.json`

`state.json` is the source of truth for tracked task status.

Expected shape:

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

Rules:

- Always read `state.json` before any task operation
- If it is missing, initialize it as `{ "tasks": [] }`
- Never remove entries; update `status` and `path` instead
- Keep `path` relative to the project root
- Treat task folders and `state.json` as a matched pair; do not update one without the other
- Prefer `bun skills/context-task/updateTaskState.ts --id <id> --to active|completed [--date YYYY-MM-DD]` for task state transitions instead of hand-editing `state.json`

## Task IDs And Folder Names

- If a real ticket ID exists, use it as the task ID
- Otherwise generate a short local ID
- Folder name should be `<id>-<slug>`
- The slug should be concise, lowercase, hyphenated, and stable enough to recognize later

## File Roles

### `task.md`

Use `task.md` for the stable description of the work item.

Suggested shape:

```markdown
# <title>

**ID:** <id>
**Ticket:** <url or "none">
**Created:** YYYY-MM-DD
**Status:** active

## Goal

<What should change and why>

## Acceptance Criteria

- <criterion>

## PRs

- <url> - <brief description>
```

Rules:

- Keep the goal and acceptance criteria concrete
- Update this file if the task meaning changes
- Use the `PRs` section only for links that matter to this task's history

### `notes.md`

Use `notes.md` for task-specific research, dead ends, findings, and decisions discovered while investigating the task.

Rules:

- Append-only
- Add entries under a date heading
- Include relevant file paths, constraints, dead ends, and open questions
- Record resolved ambiguities here before or alongside plan changes

Suggested shape:

```markdown
# Notes: <title>

## YYYY-MM-DD

<finding, constraint, dead end, or question>
```

### `plan.md`

Use `plan.md` for the current execution plan.

Unlike `notes.md`, `plan.md` is rewriteable.

Rules:

- Overwrite it as the plan evolves
- Keep the current plan coherent rather than append-only
- Every step should be concrete and verifiable
- Reference exact files when known
- Order steps by dependency

Suggested shape:

```markdown
# Plan: <title>

_Last updated: YYYY-MM-DD_

## Approach

<Why this approach is correct>

## Steps

1. <concrete step>
2. <concrete step>
```

### `outcome.md`

Use `outcome.md` only when the task is actually complete.

Suggested shape:

```markdown
# Outcome: <title>

**Completed:** YYYY-MM-DD

## PRs

- <url> - <brief description>

## What was done

<summary>

## What changed

<behaviors, files, or configs>

## Notes for the future

<follow-up context>
```

## Task Lifecycle Conventions

This skill does not require one fixed command sequence, but task state should still follow these conventions.

### Creating A Tracked Task

When the user wants work tracked in `.my-context/tasks/`:

1. Read or initialize `state.json`
2. Determine the task ID and title
3. Create `.my-context/tasks/active/<id>-<slug>/`
4. Write `task.md`
5. Add the entry to `state.json`

Prefer `bun skills/context-task/createTask.ts --title "<title>" [--id <id>] [--ticket <ticket>] [--goal "<goal>"] [--acceptance "<criterion>"]... [--created YYYY-MM-DD]` for task creation instead of hand-editing `state.json`.

Ask follow-up questions only when the request is too ambiguous to create a safe default.

### Research And Planning

When researching:

- read `task.md` first
- append findings to `notes.md`
- keep task-local discoveries here unless they are durable enough for `context-memory`

When planning:

- read `task.md` and `notes.md`
- write or rewrite `plan.md`
- keep the plan aligned with actual codebase findings

### Execution And Review

During implementation:

- treat `plan.md` as the current source of execution intent
- update it if the plan legitimately changes
- record task-specific discoveries in `notes.md`
- add PR links to `task.md` when they exist and matter

### Completion

When the task is complete:

1. Write `outcome.md`
2. Use `bun skills/context-task/updateTaskState.ts --id <id> --to completed [--date YYYY-MM-DD]` so the folder move and `state.json` update happen together
3. Confirm the `state.json` entry is `status: "completed"`
4. Confirm the `path` in `state.json` is the nested completed location

Do not mark a task complete in `state.json` before the folder move and outcome write are real.

## What Belongs Here Vs `context-memory`

Keep in task files:

- active investigation notes
- plan revisions
- task-specific dead ends
- per-task PR links
- final outcome summary

Move to `context-memory` only when the information is useful across future sessions or other tasks.

## Red Flags

Do not:

- invent a second workflow on top of the current skills
- use `notes.md` as a replacement for `plan.md`
- store durable project memory only in task-local notes
- update `state.json` without matching folder/file changes
- treat completed tasks as disposable; they are part of project history

## Bottom Line

Use this skill to keep `.my-context/tasks/` coherent while the current planning, execution, and review workflows do their work.
