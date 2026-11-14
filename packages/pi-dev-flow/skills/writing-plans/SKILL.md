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

Include:

- The goal and change boundary
- The implementation steps and relevant files
- The verification method
- Risks or decisions that need attention

Group work by complete behavior. Keep implementation and its tests together. Do not create separate execution units just because code, tests, and documentation can be checked separately.

Add explicit non-goals, handoff contracts, or investigation limits only where ambiguity or risk requires them. Do not require a frozen brief or budget for every step.

## Review and Proceed

Check that the plan covers the request without unrelated work. Use `plan-reviewer` only for high-risk plans, unresolved design concerns, or a user-requested review.

If implementation is already authorized and no material decision remains, proceed without another approval round. If the user requested only a plan, present it and stop. Ask for a decision when the plan changes requested behavior, commitments, or unapproved tradeoffs.

During execution, adjust local implementation details within the agreed scope. Update the plan when discoveries affect the remaining work. Escalate material scope or architecture changes, not routine coding adjustments.
