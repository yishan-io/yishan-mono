---
name: ys-research
description: Research a task. Understand requirements, explore the codebase, and search project memory (.my-context/) for relevant history. Record findings in notes.md.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I investigate a task before planning or building. I understand the requirement,
explore the codebase, search `.my-context/` for relevant past decisions and
architecture, and record findings in the task's `notes.md`.

Use me after `ys-start` and before `ys-plan`.

## When to use me

- A task has been created and needs investigation before planning
- The user asks you to "look into" or "research" a task
- You need to understand how existing code relates to the task
- You need to find relevant architecture docs, past decisions, or learned items

## Prerequisites

- A task folder must exist under `.my-context/tasks/active/<id>-<slug>/` (created by `ys-start`).
- The `yishan` CLI must be available for memory search.

## Session environment

| Variable | Value |
|---|---|
| `YISHAN_PROJECT_ID` | Project the workspace belongs to |

## Research sources

Search in this priority order:

1. **Project memory (.my-context/)** — Search for related architecture, decisions, and past work:
   ```bash
   yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<1-3 keywords>"
   ```
   Read the returned paths for full context. This indexes everything in `.my-context/`:
   architecture docs, past decisions, learned items, completed tasks, future improvements.

2. **Existing task notes** — Check if the task folder already has `notes.md` with prior research.

3. **Codebase** — Use search tools to find relevant code, patterns, and existing implementations.

## Grilling Mode

When research surfaces ambiguity that codebase exploration cannot resolve,
switch into grilling mode to resolve it before writing `notes.md`.

**Activate when any of these is true:**

- The requirement is underspecified and the codebase gives no clear answer.
- Two or more equally valid interpretations exist with different implementation
  consequences.
- A non-obvious risk or constraint is discovered that the user may not have
  considered.

**Rules:**

1. Ask one question at a time — never multiple at once.
2. Provide your own recommended answer with every question.
3. If a question can be answered by exploring the codebase, explore first and
   skip asking.
4. Wait for the user's response before asking the next question.

**Exit:** Grilling ends when all blocking ambiguities are resolved. Record each
resolved decision in `notes.md` before continuing research.

## notes.md format

Append-only. Add findings under a date heading. Never rewrite previous entries.

```markdown
# Notes: <title>

## YYYY-MM-DD

<finding, question, or dead end>
```

Each entry should capture:
- What was investigated
- What was found (file paths, patterns, relevant code)
- Open questions or unknowns
- Dead ends or things that won't work

## Workflow

### Researching a task

1. Read `.my-context/tasks/state.json` to find the task folder.
2. Read the task's `task.md` to understand the goal and acceptance criteria.
3. Search project memory for relevant history:
   ```bash
   yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<keywords>"
   ```
4. Explore the codebase: find relevant files, existing patterns, entry points.
5. Read any relevant `.my-context/` docs returned by memory search.
6. Append findings to `notes.md` under a new date heading (`## YYYY-MM-DD`).
7. Include file paths, code snippets, links, and open questions.
8. When research is complete, suggest the next step: `ys-plan`.
