---
name: writing-plans
description: Use when you have approved requirements for a multi-step task and need a concrete implementation plan before touching code.
---

# Writing Plans

Use this skill to turn requirements or an approved design into an implementation plan.

## Durable Context

When the work has a Local Task, use native `task_*` tools alongside this skill.

- use `task_read` to load the task goal and `notes`
- record task-specific research and constraints in `notes` with `task_append_note` or `task_write`
- write the resulting plan with `task_write`

When prior project decisions or non-obvious history may matter, use `memory_search` and `memory_read` before finalizing the plan.

## When to Use This Skill

Use this skill when:

- The work has multiple steps or checkpoints
- The user wants a plan before implementation
- The task spans several files or responsibilities
- The requirements are clear enough to sequence into execution tasks

Do not use this skill for tiny, direct edits that can be implemented safely without separate planning.

## Core Principles

- Plan against the real codebase, not an imagined structure
- Make tasks small enough to verify independently
- Keep the plan concrete: exact files, responsibilities, and validation steps
- Prefer the smallest correct implementation
- Follow existing project patterns unless there is a strong reason not to

## Workflow

### 1. Confirm Inputs

Before writing the plan, make sure you have:

- The approved goal or requirements
- Enough codebase context to know where the change belongs
- A reasonable task boundary

If a Local Task exists for the work, use `task_read` to load its brief first. Read its `notes` document too when it contains research.

If the request is too broad, split it into smaller plans.

### 2. Map the File Structure

Before listing tasks, identify:

- Which files will likely change
- Which new files may be needed
- What responsibility each file should have

Prefer focused responsibilities and clear interfaces. Avoid unnecessary restructuring.

If there may be relevant prior decisions, architecture notes, or durable discoveries, check them with `memory_search` and `memory_read` before locking the file map and task boundaries.

### 3. Break Work Into Tasks

Each task should:

- Produce a meaningful, testable checkpoint
- Have a clear scope
- Include the files involved
- Include how the result will be verified

Good task boundaries usually separate:

- setup or scaffolding that enables later work
- core behavior changes
- UI or integration wiring
- tests and validation
- documentation or follow-up cleanup when needed

### 4. Make Each Task Concrete

For each task, include:

- Task name
- Goal
- Files to create or modify
- Main implementation steps
- Validation steps
- Risks or dependencies if they matter

Use exact file paths whenever you know them.

### 5. Include Verification

Every plan should say how to verify progress.

Examples:

- Run a focused test file
- Run the relevant lint command
- Exercise the feature manually
- Verify a specific regression case

### 6. Review the Plan in Isolation

After drafting the plan, use the native `subagent` tool for a fresh, read-only plan review pass.

Give the reviewer:

- The plan path or plan content
- The original requirements or approved design
- Any project-wide constraints
- Any areas you are uncertain about

Use the review to catch:

- missing requirements
- oversized or poorly ordered tasks
- vague steps or placeholders
- weak validation steps
- unnecessary scope

Fix the plan before presenting it as ready.

If the plan belongs to a Local Task, keep its `plan` document as the current source of planning truth rather than leaving the plan only in transient conversation history.

## Suggested Plan Format

```markdown
# <Feature Name> Implementation Plan

**Goal:** <one-sentence outcome>

**Context:** <key codebase or product constraints>

## File Map

- Modify: `path/to/file.ts` - <responsibility>
- Create: `path/to/new-file.ts` - <responsibility>

## Tasks

### Task 1: <name>

**Goal:** <what this task delivers>

**Files:**
- Modify: `path/to/file.ts`
- Create: `path/to/test.ts`

**Steps:**
1. <concrete action>
2. <concrete action>
3. <concrete action>

**Verify:**
- Run: `<command>`
- Expect: <result>

### Task 2: <name>
...
```

## Quality Bar

Do not write plans with placeholders like:

- TBD
- TODO
- implement later
- add tests
- handle edge cases

Replace vague instructions with explicit actions.

## Self-Review

After writing the plan, check:

1. Does every requirement map to a task?
2. Are task boundaries small enough to verify?
3. Are file paths and ownership clear?
4. Are validation steps specific?
5. Did you avoid unnecessary scope?

Fix obvious gaps inline before requesting the review.

After the review subagent returns findings:

1. Apply needed fixes to the plan
2. Re-check for consistency after the edits
3. Present the revised plan to the user

## Handoff

When the plan is complete:

- If the work has a Local Task, write or update its `plan` document with `task_write`
- Present the plan clearly to the user
- Mention that it has passed a read-only subagent review
- Ask whether they want changes before implementation
- If approved, switch to implementation or the relevant execution workflow
