---
name: finishing-task
description: Use only when the user explicitly asks to finish a tracked `.my-context/tasks/` record and it needs durable wrap-up and memory promotion.
---

# Finishing Task

Use this skill only when the user explicitly asks to close, finish, or complete a tracked task. It defines the completion quality gate; `task_finish` performs the task completion operation.

Do not invoke this skill automatically at the end of implementation, review, or a session.

## Preconditions

Before proposing or performing completion, confirm as applicable that:

- requested work is actually implemented
- relevant verification has passed
- important review feedback is resolved or explicitly accepted
- the stable brief, plan, and task notes accurately preserve useful history
- durable docs and durable memory have been checked for required updates

Do not mark a task complete because coding started, implementation seems done, or the user paused. Finishing the task record does not create a PR or close an external ticket; those remain separate human actions and require explicit user instruction.

## Done Standard

The durable record must reflect what actually happened. Before finishing, explicitly check:

- the outcome will factually describe what was delivered
- existing architecture or durable docs need updates, or a durable doc is needed for a lasting change
- a root cause, invariant, workflow trap, decision, or architecture fact should be promoted to `context-memory`

Required durable documentation and durable memory updates are part of finishing, not optional follow-up. Search existing `.my-context/` documentation first; update the best existing document where possible, and create one only when no existing document fits.

## Prepare the Outcome

Prepare a concise factual outcome for `task_finish`:

- state what was actually delivered
- include concrete completed behavior, file, or configuration changes
- include meaningful follow-ups or gotchas when applicable
- include relevant PR links when they exist

Do not include session chatter or describe merely planned work as delivered.

## Complete on the User's Direction

After the user explicitly directs completion and all gates above pass:

1. Use `task_finish` with the factual outcome.
2. Use its returned task summary to confirm the task is completed.
3. Promote only future-useful cross-task knowledge through `context-memory`.

`task_finish` writes the outcome and performs the completed-state move. Do not move task folders or edit `state.json` directly.

## Architecture and Supporting Docs

Update existing durable documentation when a completed task changes documented behavior. Add a durable document only when a new component, flow, or long-lived concept lacks a suitable home. Do not create parallel documentation when an existing document should be updated.

## Red Flags

Do not:

- invoke this skill or call `task_finish` without explicit user instruction
- finish before verification is real
- create or raise a PR without explicit user instruction
- close an external ticket without explicit user instruction
- manipulate `outcome.md`, task folders, or `state.json` directly
- dump the entire task history into `context-memory`
- skip a needed durable-doc or future-useful memory update

## Bottom Line

On explicit user direction, verify the work and durable record, prepare a factual outcome, finish with `task_finish`, and preserve only future-useful learnings in durable memory.
