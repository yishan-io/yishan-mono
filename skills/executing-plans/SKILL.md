---
name: executing-plans
description: Use when you have an approved implementation plan and want to execute it directly in the current session without the full subagent-driven workflow.
---

# Executing Plans

Use this skill to execute a written implementation plan directly in the current session.

## Relationship To Context Skills

When the work is tracked in `.my-context/tasks/`, use `context-task` as the durable execution record.

- read the active plan from `plan.md`
- keep task-specific discoveries in `notes.md`
- keep PR links and task metadata in `task.md` when relevant
- write `outcome.md` when the task is complete

Use `context-memory` only for durable cross-task facts or decisions that should survive beyond this one task.

## Why This Skill Exists

This is the lighter-weight alternative to `subagent-driven-development`.

Use it when you want to:

- execute a plan yourself in one session
- avoid the overhead of per-task builder and reviewer dispatches
- keep the workflow simpler while still following a real plan

If you want stronger context isolation and per-task review gates, use `subagent-driven-development` instead.

## When to Use This Skill

Use this skill when:

- you already have an approved implementation plan
- the plan is clear enough to execute directly
- the work is moderate in size or tightly coupled enough that repeated handoffs add little value
- you do not need the full subagent orchestration loop

Do not use this skill when the plan is highly parallelizable, benefits from strict per-task isolation, or needs repeated review gates between tasks.

## Workflow

### 1. Load And Review The Plan

Before editing code:

- read the plan carefully
- check for contradictions, missing prerequisites, or unclear steps
- raise real concerns before starting implementation

If the work is tracked in `.my-context/tasks/`, read `plan.md` from the task folder and also skim `task.md` and `notes.md` before starting.

Do not treat the plan as automatically correct just because it exists.

### 2. Create Execution Tracking

Track the plan tasks as you execute them.

At minimum:

- identify each task
- mark one task in progress at a time
- mark tasks complete only after their verification passes

Use durable task tracking if the plan is long enough that interruption or compaction is likely.

When a `.my-context` task exists, prefer the task folder as that durable tracking layer instead of relying only on transient conversation state.

### 3. Execute One Task At A Time

For each task:

1. understand the scope
2. perform the listed implementation steps
3. run the task's verification steps
4. confirm the result before moving on

During execution, keep task-local discoveries and course corrections synchronized into `notes.md` or `plan.md` when they would otherwise be lost across interruption.

Do not skip ahead just because later tasks seem related.

### 4. Handle Problems Explicitly

Stop and reassess when:

- the plan is missing a needed detail
- verification fails repeatedly
- the real codebase does not match the plan closely enough
- a task reveals that the earlier plan structure was wrong

Ask for clarification or revise the plan instead of forcing through blockers.

If the plan changes materially, update `plan.md` through `context-task` so the durable record stays accurate.

### 5. Final Validation

After all tasks are complete:

- run the broader relevant verification
- make sure the implementation still matches the plan's goal
- request code review if the change is substantial or risky

If the work is tracked in `.my-context/tasks/`, finish by writing `outcome.md` and updating task state through `context-task` once completion is real.

For final review, use the local `requesting-code-review` skill when appropriate.

## Relationship To Other Local Skills

- `context-task` provides the durable task record for tracked work
- `context-memory` provides cross-task historical context when needed
- `writing-plans` creates the plan
- `executing-plans` executes it inline in the current session
- `subagent-driven-development` is the heavier alternative with dedicated builder/reviewer loops
- `requesting-code-review` handles explicit review after implementation

## Red Flags

Do not:

- start implementing before reviewing the plan
- skip task-level verification
- keep going through repeated failures without reassessing
- silently change the plan's intent without surfacing it
- use this skill when the work clearly needs stronger isolation and review gates

## Bottom Line

This skill is for disciplined inline execution of a real plan: review first, execute task by task, verify continuously, and escalate when the plan or implementation stops making sense.
