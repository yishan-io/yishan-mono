---
name: writing-plans
description: Use when the user requests a plan, or when architecture choices, dependencies, or migration risks need a written implementation plan. Do not use merely because a change has multiple steps or files.
---

# Writing Plans

Write a plan when it reduces uncertainty or coordination risk. A clear, local change does not need a separate planning phase.

## Choose the Detail

For ordinary multi-file work, a short checklist in the current session is enough. Use a formal plan for architectural choices, complex dependencies, risky migrations, or an explicit user request.

Read the relevant code before planning. Check durable memory when prior decisions affect the design. If a Local Task already tracks the work, read its brief and relevant notes, then save the plan with `context-task`. Planning does not itself require a new Local Task.

## Write the Plan

Every plan must include:

- Goal: the outcome, in one or two sentences.
- Done when: checkable success criteria.
- Out of scope: what the plan will not change.
- Steps: for each step, the files it touches and the exact command that verifies it.
- Decisions: each choice between approaches, with the options, the pick, and the reason. Mark any decision the user has not approved as `NEEDS APPROVAL`.
- Risks: what could go wrong and how you will notice.

Group work by complete behavior. Keep implementation and its tests together. Do not create separate execution units just because code, tests, and documentation can be checked separately.

Do not require a frozen brief or budget for every step. Add a handoff contract only when a step is delegated (see `subagent-driven-development`).

## Review and Proceed

Check that the plan covers the request without unrelated work. Use `plan-reviewer` only for high-risk plans, unresolved design concerns, or a user-requested review.

Present the plan and stop for approval if any of these is true: the plan has a `NEEDS APPROVAL` decision, it changes an architecture or data format, it includes a migration, it touches files outside what the request implies, or the user asked only for a plan. A request such as "fix X" authorizes the result, not an architecture or migration you chose. Proceed without another approval round only when none of these applies, or when the user has said to go ahead with this plan.

During execution, adjust test cases and local code inside the files listed in the plan. Touching a file not listed in the plan counts as a scope change: ask first. Update the plan when a discovery changes the remaining steps, and record that change in the task notes.
