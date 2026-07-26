---
name: starting-task
description: Use when beginning a new piece of work and deciding whether to create a tracked task in `.my-context/tasks/`, especially before research, planning, or implementation on non-trivial work.
---

# Starting Task

Use this skill when new work arrives and you need to decide whether it should become a tracked task.

## Purpose

This skill decides when durable task tracking is worthwhile. `pi-task` provides direct task-file operations; `context-task` defines document-quality policy.

## When To Use This Skill

Use this skill when:

- the user asks to start or track a task
- a request is substantial enough to benefit from durable tracking
- the work will likely need research, planning, review, or multiple sessions

Usually do not use it for tiny one-shot edits, purely informational questions, or throwaway exploration.

## Decision Rule

Create a tracked task when one or more of these is true:

- the work is multi-step or spans multiple files
- the work may take multiple sessions
- the work benefits from explicit notes, planning, or completion history
- the user explicitly asks to track it

If none apply, proceed without task initialization.

## Start The Record

Use `task_start` to create the record. Supply a concise title and all stable information known from the request: ID when one is supplied, ticket reference, focused goal, concrete acceptance criteria, and created date when known.

Prefer a safe inferred first draft over unnecessary follow-up questions. Generate a concise title, focused goal, and concrete acceptance criteria when the user did not provide them; ask only when the request is too ambiguous for a safe default.

`task_start` creates the active task record. Do not create task folders, edit `state.json`, or manipulate task paths directly.

## After Initialization

For tracked work, use the natural phases:

1. Research — use `context-task` and `context-memory`; record task-specific findings with `task_append_note`.
2. Plan — use `writing-plans`; persist the coherent plan with `task_write` (`document: "plan"`).
3. Execute — use `executing-plans` or `subagent-driven-development`.

For simple, well-scoped work these phases may happen in one session. For larger or riskier work, pause at natural checkpoints and confirm with the user before proceeding.

**Never do these automatically:**

- Create or raise a PR without explicit user instruction.
- Close an external ticket (GitHub issue, Jira, Linear, and so on) without explicit user instruction.
- Finish a task with `task_finish` without explicit user instruction.

## Red Flags

Do not:

- create tracked tasks for every trivial request
- ask for fields that can be inferred safely
- manipulate task folders, task documents, or `state.json` directly
- create or raise a PR without explicit user instruction
- close an external ticket without explicit user instruction
- finish a task without explicit user instruction

## Bottom Line

Use `starting-task` to decide whether work deserves durable tracking, then use `task_start` to create its active record with the best available stable brief.
