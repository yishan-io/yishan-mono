---
name: ys-build
description: Build the task as planned. Execute each step from plan.md, write code, and ensure unit tests are covered.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I execute the plan from `plan.md` step by step. I write code, create or update
files, and ensure every new or changed behavior has unit test coverage.

Use me after `ys-plan` and before `ys-verify`.

## When to use me

- The plan is ready and the user is ready to start coding
- The user asks you to "build", "implement", or "code" the task
- A specific step from the plan needs to be executed

## Prerequisites

- `plan.md` must exist with a clear, ordered list of steps.
- The codebase must be buildable in its current state.

## Coding rules

1. **Follow the project's coding guide.** Read `docs/coding-guide.md` before writing any code.
2. **Follow existing conventions.** Mimic code style, use existing libraries and utilities.
3. **One step at a time.** Complete a step, verify it compiles/tests pass, then move to the next.
4. **Add unit tests for every new or changed behavior.** No test = not done.
5. **No file over 500 lines. No React component over 300 lines. No Go function over 40 lines.**
6. **Use `getErrorMessage(error)` not inline error handling.** Use `generateId()` not `crypto.randomUUID()`.
7. **Never commit unless explicitly asked.**

## Simplicity Rules

Apply these while building each step:

1. **Prefer deletion over addition.** Remove parallel code paths, duplicate sources of truth, and scaffolding if the task does not require them.
2. **Prefer stdlib/native behavior before custom code.** Use built-in language or platform features before adding helpers or dependencies.
3. **Prefer the fewest files possible.** If the change can stay in one existing file cleanly, do that.
4. **Do not add abstractions for one caller.** No interface, factory, config, or layer unless the task already needs multiple real consumers.
5. **Leave one minimal check for non-trivial logic.** Keep tests small and targeted; do not overbuild the test surface for trivial code.

## Workflow

### Building a task

1. Read `.my-context/tasks/state.json` to find the task folder.
2. Read `plan.md` to get the ordered steps.
3. For each step:
   a. Announce the step being executed.
   b. Read any files the step references.
   c. Write or edit the code, following the simplicity rules before adding any new structure.
   d. Write unit tests for the new/changed code.
   e. Run the tests for the affected area. If they fail, fix before proceeding.
   f. Mark the step as done in `plan.md` by appending ` (done)` or adding a checkmark.
4. After all steps are complete, run the full test suite:
   ```bash
   bun run test
   ```
   or for Go:
   ```bash
   go test ./...
   ```
5. If all tests pass, suggest the next step: `ys-verify`.

### Encountering issues

If a step cannot be completed as planned:
1. Note the issue in `notes.md` under a new date heading.
2. Update `plan.md` with a revised approach or additional step.
3. Continue with the adjusted plan.
