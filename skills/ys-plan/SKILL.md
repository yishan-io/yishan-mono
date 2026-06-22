---
name: ys-plan
description: Plan a task based on research. Read task.md and notes.md, then draft an execution plan in plan.md with approach and ordered steps.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I read the task goal and research findings, then draft an execution plan in
`plan.md`. The plan describes the approach, lists ordered steps, and identifies
key files to touch. It serves as the blueprint for `ys-build`.

Use me after `ys-research` and before `ys-build`.

## When to use me

- Research is complete and the task is ready to be planned
- The user asks you to "plan" or "figure out how to" do a task
- You need to break down a complex task into ordered steps

## Prerequisites

- A task folder must exist at `.my-context/tasks/active/<id>-<slug>/`.
- `task.md` must have the goal and acceptance criteria.
- `notes.md` should have research findings (created by `ys-research`).

## plan.md format

Rewrite freely as the plan evolves. Overwrite the file on each planning session.

```markdown
# Plan: <title>

_Last updated: YYYY-MM-DD_

## Approach

<High-level approach and why this is the right way>

## Steps

1. <step — what to do, which files to touch, expected outcome>
2. <step>
```

## Rules

1. **Every step must be concrete and verifiable.** No vague steps like "improve the code."
2. **Reference specific files** when possible (e.g. "Modify `src/auth/token.ts:45` to add expiry check").
3. **Order by dependency.** Steps that others depend on come first.
4. **Keep steps small.** Each step should be a single unit of work (<~50 lines of code).
5. **Cover tests.** Include steps for writing or updating unit tests.
6. **Account for acceptance criteria.** Every criterion from `task.md` must be addressed by at least one step.

## Minimal Change Heuristics

Before locking the plan, check these in order and stop at the first one that fits:

1. **Can the task be narrowed or skipped?** If part of the request is speculative or not needed for the acceptance criteria, leave it out.
2. **Can existing code already cover it?** Prefer extending an existing path over adding a parallel one.
3. **Can stdlib, native platform behavior, or an already-installed dependency handle it?** Prefer that over custom helpers or new dependencies.
4. **Can the plan touch fewer files?** Prefer the shortest diff that still satisfies the task.

Do not plan abstractions with one implementation, config nobody sets, or scaffolding "for later". If two plans are both correct, choose the smaller one.

## Grilling Mode

When research leaves approach decisions unresolved, switch into grilling mode
before writing `plan.md`.

**Activate when any of these is true:**

- Multiple approaches are viable and the choice significantly impacts scope,
  architecture, or future work.
- A planned step requires a design decision that was not resolved during
  research.

**Rules:**

1. Ask one question at a time — never multiple at once.
2. Provide your own recommended answer with every question.
3. If a question can be answered by exploring the codebase, explore first and
   skip asking.
4. Wait for the user's response before asking the next question.

**Exit:** Grilling ends when the approach is chosen. Record the decision in
`notes.md` before writing `plan.md`.

## Workflow

### Planning a task

1. Read `.my-context/tasks/state.json` to find the task folder.
2. Read the task's `task.md` for the goal and acceptance criteria.
3. Read the task's `notes.md` for research findings, relevant files, and constraints.
4. Draft `plan.md`:
   - **Approach**: Summarize the strategy in 2-4 sentences. Reference relevant architecture docs or patterns.
   - **Steps**: List ordered, concrete steps. Each step should mention specific files.
   - **Apply the minimal change heuristics**: delete scope, reuse existing code, use stdlib/native behavior, and minimize files before planning new structure.
5. Review the plan against acceptance criteria — every criterion must map to at least one step.
6. Write `plan.md`.
7. Suggest the next step: `ys-build`.

### Revising a plan

If the plan needs adjustment (discoveries during build, changed requirements):
1. Read the existing `plan.md`.
2. Update the approach and steps as needed.
3. Update the `_Last updated:` timestamp.
4. Write `plan.md`.
