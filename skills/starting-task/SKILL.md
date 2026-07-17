---
name: starting-task
description: Use when beginning a new piece of work and deciding whether to create a tracked task in `.my-context/tasks/`, especially before research, planning, or implementation on non-trivial work.
---

# Starting Task

Use this skill when new work arrives and you need to decide whether it should become a tracked task.

## Why This Skill Exists

This skill is the entry point into the current workflow for tracked work.

It does not replace `context-task`.

Instead, it decides when task tracking is worth creating and then initializes the task record correctly so the rest of the flow has a durable place to work from.

## When To Use This Skill

Use this skill when:

- the user asks to start a task
- a request looks substantial enough to benefit from durable tracking
- the work will likely need research, planning, review, or multiple sessions
- the work should leave a durable record in `.my-context/tasks/`

Usually do not use this skill for:

- tiny one-shot edits
- purely informational questions
- throwaway exploration with no need for durable task state

## Decision Rule

Create a tracked task when one or more of these is true:

- the work is multi-step
- the work will likely span multiple files
- the work may take multiple sessions
- the work benefits from explicit notes, planning, or completion history
- the user explicitly asks to track it

If none of those are true, proceed without task initialization.

## Relationship To Other Skills

- `starting-task` decides whether to create tracked work
- `context-task` defines the task folder, files, and `state.json` rules
- `context-memory` handles durable cross-task knowledge
- `writing-plans` uses the task record to produce `plan.md`
- `executing-plans` or `subagent-driven-development` execute the work

## What To Create

When the work should be tracked:

1. Initialize or read `.my-context/tasks/state.json`
2. Determine a task ID and concise title
3. Create `.my-context/tasks/active/<id>-<slug>/`
4. Write `task.md`
5. Add the task entry to `state.json`

Prefer `bun skills/context-task/createTask.ts --title "<title>" [--id <id>] [--ticket <ticket>] [--goal "<goal>"] [--acceptance "<criterion>"]... [--created YYYY-MM-DD]` instead of hand-editing task state.

Use `context-task` for the exact file conventions.

## Input Quality

Prefer generating a reasonable first draft over blocking on unnecessary questions.

If the user did not provide full task details:

- generate a concise title
- generate a focused goal
- generate concrete acceptance criteria

Ask follow-up questions only when the request is too ambiguous to create a safe default.

## Suggested `task.md` Contents

At minimum, initialize:

- title
- ID
- ticket reference if known
- created date
- active status
- goal
- acceptance criteria

Do not wait for perfect wording before creating the task.

## After Initialization

Once the tracked task exists:

1. use `context-task` as the persistent task layer
2. use `context-memory` if prior project history matters
3. research into `notes.md` when needed
4. plan with `writing-plans` into `plan.md`
5. execute with `executing-plans` or `subagent-driven-development`

## Red Flags

Do not:

- create tracked tasks for every trivial request
- ask the user for fields you can infer safely
- start planning or implementing tracked work without first creating the task record when durable tracking is clearly useful
- invent a second task lifecycle separate from `context-task`

## Bottom Line

Use `starting-task` to decide whether work should be tracked and, when it should, initialize the `.my-context/tasks/` record so the rest of the workflow has a clean place to operate.
