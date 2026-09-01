---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially when feedback is unclear, broad, or may not fit the codebase as-is.
---

# Receiving Code Review

Use this skill when handling review feedback from a user, teammate, or external reviewer.

## Core Principle

Verify before implementing. Ask before assuming. Prefer technical correctness over performative agreement.

## Response Pattern

When receiving review feedback:

1. Read all feedback fully before reacting
2. Restate the technical requirement in your own words if needed
3. Verify the feedback against the actual codebase
4. Decide whether the suggestion is correct for this project
5. Respond with a factual acknowledgment or reasoned pushback
6. Implement one item at a time and verify each change

## Do Not

- Do not blindly agree before checking the code
- Do not implement unclear feedback without clarification
- Do not add complexity just because a reviewer suggested a more "proper" solution
- Do not optimize for politeness over correctness

## When Feedback Is Unclear

If any review item is ambiguous:

- Stop before implementing
- Ask for clarification on the unclear parts
- Avoid partially implementing a multi-part review when key pieces are still unclear

Example:

```text
I understand items 1, 2, and 4. I need clarification on item 3 before I make the changes.
```

## Evaluating Feedback

Before implementing a suggestion, check:

- Is it technically correct for this codebase?
- Does it break existing behavior?
- Is there an existing reason the current code works this way?
- Does it fit the project's platform, version, and architectural constraints?
- Is it actually needed, or is it unnecessary extra scope?

If the answer is uncertain, investigate first or ask the user how far to dig.

## YAGNI Check

If review feedback pushes toward a larger or more "complete" solution:

- Check whether the feature is actually used
- Prefer removing dead code or simplifying behavior over adding unused infrastructure
- Keep the fix scoped to the real requirement

Example:

```text
I checked usage and nothing currently calls this path. We should remove it instead of expanding it unless there is a real consumer.
```

## Implementation Order

For multi-item feedback:

1. Clarify unclear items first
2. Fix blocking or correctness issues first
3. Apply small mechanical fixes next
4. Handle larger refactors last
5. Verify each fix and check for regressions

## When To Push Back

Push back when the suggestion:

- Breaks working behavior
- Assumes context not supported by the code
- Adds unnecessary scope
- Conflicts with project constraints or prior decisions
- Is technically incorrect for the stack or version in use

Push back with concrete reasoning:

- Reference code paths, tests, or behavior
- Explain the constraint clearly
- Ask a focused follow-up question if needed

Example:

```text
I checked this path and the legacy branch is still required for the supported platform range. I can simplify the surrounding code, but removing that branch would be a regression.
```

## Acknowledging Correct Feedback

When feedback is correct, keep the response direct and factual.

Good:

```text
Fixed. The null case was unhandled in `src/foo.ts`.
```

```text
Verified and fixed. The import was unused after the refactor.
```

Avoid exaggerated agreement or filler. Prefer the fix and a concise explanation.

## If Your Initial Pushback Was Wrong

Correct course plainly:

```text
Verified this and you're correct. My initial read was wrong because the value is normalized earlier in the flow. Fixing now.
```

Do not over-explain. State the correction and proceed.

## GitHub Review Threads

When responding to inline GitHub review comments, reply in the review thread rather than posting a separate top-level comment.

## Bottom Line

Review comments are inputs to evaluate, not instructions to follow blindly.

Check the code. Clarify ambiguity. Then make the smallest correct change.
