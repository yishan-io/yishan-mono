---
name: context-task
description: Use when working with a tracked `.my-context/tasks/` record and its task-specific documents during research, planning, execution, review, or user-directed completion.
---

# Context Task

Use this skill with the task workflow skills to keep one tracked work item's durable record useful and accurate. It defines document semantics and agent judgment; `pi-task` provides direct task-file operations.

Use it together with `writing-plans`, `executing-plans`, `subagent-driven-development`, and `requesting-code-review`. Use `context-memory` for durable knowledge that belongs across tasks.

## Task Documents

A tracked task has these durable documents:

- `task.md` — stable task brief: title, ID, ticket, created date, status, goal, acceptance criteria, and relevant PR links.
- `notes.md` — append-only task-specific research, discoveries, decisions, dead ends, constraints, and open questions.
- `plan.md` — the current coherent, rewriteable execution plan.
- `outcome.md` — a concise factual summary of what happened, written only for a user-directed completed task.

Use `task_read` to read task documents by task ID. It reads the selected document directly. Use `task_list` to find task IDs or filter tasks by status.

## Document Quality Rules

### Stable brief (`task.md`)

Keep the goal and acceptance criteria concrete. Update stable brief sections when the task meaning changes or a relevant ticket/PR reference becomes available. Use `task_write` (`document: "task"`) to rewrite the full stable brief while preserving the sections that remain accurate. Do not use it for transient progress notes.

### Notes (`notes.md`)

Keep notes append-only under a date heading. Record relevant paths, constraints, dead ends, decisions, and unresolved questions. Append task-specific findings with `task_append_note`; do not use notes as a replacement for the plan or for cross-task memory.

### Plan (`plan.md`)

Keep the current plan coherent rather than append-only. Every step should be concrete, verifiable, ordered by dependency, and name exact files when known. Replace the full plan with `task_write` (`document: "plan"`) when research or implementation materially changes it.

### Outcome (`outcome.md`)

Use the outcome only when the user explicitly directs task completion. It must be factual and compact: summarize what was actually delivered, list non-empty completed changes, include relevant PRs when they exist, and preserve meaningful follow-ups or gotchas as future notes. `task_finish` writes the outcome and performs the completed-state transition together.

## Lifecycle Guidance

### Creating a tracked task

Use `task_start` with the known stable brief. Prefer safe inferred title, goal, and acceptance criteria over unnecessary questions; ask only when the request is too ambiguous for a safe default.

### Research and planning

Read the relevant brief and prior notes with `task_read`. Record task-local discoveries with `task_append_note`, and replace the current plan with `task_write` (`document: "plan"`) after forming a coherent plan.

### Execution and review

Treat the plan as the current execution intent. Record meaningful task-specific discoveries and revise the plan when it legitimately changes. Rewrite `task.md` with `task_write` (`document: "task"`) when stable metadata or relevant PR references change.

### Completion

Only use `task_finish` when the user explicitly directs completion and the factual outcome, verification, durable-document, and memory-promotion checks are complete. Do not complete a task merely because implementation work appears finished.

## Boundaries and Red Flags

Do not:

- invent a second task lifecycle beside `pi-task`
- manipulate task folders, `state.json`, or task document paths directly
- use `notes.md` as a replacement for `plan.md`
- put durable cross-task knowledge only in task notes
- finish a task without explicit user direction

## Bottom Line

Use `pi-task` tools for direct task-file operations and keep task documents accurate, useful, and appropriately scoped while the workflow skills supply planning, execution, review, and completion judgment.
