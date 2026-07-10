---
name: finishing-task
description: Use when tracked work in `.my-context/tasks/` is actually complete and needs durable wrap-up, including `outcome.md`, moving the task to `completed/`, updating `state.json`, and promoting future-useful learnings into `context-memory` when appropriate.
---

# Finishing Task

Use this skill when tracked work is truly done and needs to be closed out cleanly.

## Why This Skill Exists

This skill handles the completion transition for tracked work.

It does not define how to plan or implement the task.

It defines how to finish the task record so `.my-context/tasks/` remains trustworthy and durable project learnings are not lost.

## When To Use This Skill

Use this skill when:

- a tracked task has completed implementation and verification
- the user says the task is done, complete, or ready to close
- `outcome.md` should be written
- the task folder should move from `active/` to `completed/`
- task takeaways may need to be promoted into `context-memory`

Do not use this skill when the task still has open implementation or verification work.

## Relationship To Other Skills

- `starting-task` initializes tracked work
- `context-task` defines the task files and state rules
- `context-memory` stores durable cross-task knowledge
- `writing-plans` creates `plan.md`
- `executing-plans` and `subagent-driven-development` carry out the work
- `finishing-task` closes the tracked task correctly

## Preconditions

Before finishing a task, confirm as much of this as applies:

- the requested work is actually implemented
- relevant verification has passed
- important review feedback is resolved or explicitly accepted
- `task.md` still reflects what the task became
- `plan.md` and `notes.md` are current enough to preserve useful history
- durable docs and durable memory have been checked for required updates

Do not mark a task complete just because coding started or because the user paused.

## Done Standard

For tracked work, done is not only a code state.

Done means the durable record is correct too.

Before closing the task, explicitly check:

- does `outcome.md` reflect what actually shipped?
- does `.my-context/tasks/state.json` match the final folder location?
- do existing architecture or durable docs need updates?
- is a durable doc missing and needed for future work?
- should any root cause, invariant, workflow trap, or decision be promoted into `context-memory`?

If the answer is yes to any of the durable documentation or memory questions, that update is part of finishing the task, not optional follow-up.

## What To Write

### `outcome.md`

Write a concise record of what actually happened.

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

Rules:

- describe what was actually delivered, not just what was planned
- keep it factual and compact
- include PR links when they exist and matter
- note meaningful follow-ups or gotchas, not session chatter

## Completion Transition

When the task is truly complete:

1. Read the current task folder and `state.json`
2. Write `outcome.md`
3. Check durable docs and memory for required updates
4. Move the task folder from `.my-context/tasks/active/<id>-<slug>/` to `.my-context/tasks/completed/<id>-<slug>/`
5. Update the matching `state.json` entry:
   - set `status` to `"completed"`
   - update `path` to the completed location

Treat the folder move and `state.json` update as one state transition.

## Using `context-memory`

Finishing a task is a common time to promote durable knowledge into project memory.

Use `context-memory` when the task surfaced:

- a root cause worth remembering
- an invariant future edits could break
- a workflow or environment trap likely to recur
- a decision that should constrain future work
- architecture knowledge that outlives this task

Do not copy the whole task summary into `MEMORY.md`.

Promote only the durable parts.

If the task produced future-useful knowledge and `context-memory` was not updated, the task is not fully finished yet.

## Architecture And Supporting Docs

If the completed task changed important architecture behavior or project conventions:

- update existing `.my-context/architecture/` docs when needed
- add a new architecture or supporting durable doc when the changed area has no adequate existing document
- avoid creating parallel docs when one existing doc should be updated instead

Search existing memory/docs first before adding new durable documentation.

Use these rules:

- new component or module -> add a durable doc if future readers need a stable explanation of responsibility and fit
- changed behavior -> update the existing doc that describes that behavior
- new flow or process -> document the flow; use diagrams when that is the existing project convention or the flow is easier to understand visually
- no durable behavior change -> no durable doc update needed

Missing documentation is part of the task if the completed change created a documentation hole in durable project knowledge.

### Search First

Before adding a new durable doc:

1. search existing `.my-context/` docs for the changed area
2. update the best existing document when that keeps knowledge centralized
3. create a new document only when the topic does not fit any existing durable doc cleanly

Prefer one correct durable document over several overlapping notes.

## Red Flags

Do not:

- close a task before verification is real
- move the folder without updating `state.json`
- update `state.json` to completed while the task still lives under `active/`
- dump the entire task history into `context-memory`
- skip `outcome.md` for work that was meaningfully tracked
- skip a needed durable doc update because "the code is obvious"
- leave a missing durable doc uncreated when the change introduced a new important long-lived concept or flow
- skip future-useful memory updates after discovering a real root cause, invariant, or workflow trap

## Bottom Line

Use `finishing-task` to end tracked work cleanly: record the outcome, move the task to completed state, update the index, and preserve only the future-useful learnings in durable memory.
