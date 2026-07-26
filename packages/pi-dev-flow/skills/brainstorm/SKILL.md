---
name: brainstorm
description: Helps explore ideas before implementation. Use when the user wants to brainstorm features, compare approaches, shape requirements, or discuss tradeoffs before writing code.
---

# Brainstorm

Use this skill to turn a rough idea into a concrete direction before implementation.

## When to Use This Skill

Use this skill when the user:

- Asks to brainstorm, explore, or think through an idea
- Wants help shaping a feature before coding
- Needs options, tradeoffs, or a recommendation
- Is unsure about scope, UX, architecture, or workflow
- Wants a spec or plan before implementation

Do not use this skill when the request is already specific and the user clearly wants code changes now.

## Core Rules

- Do not start implementing while still in brainstorming mode
- Ask one clarifying question at a time when requirements are fuzzy
- Prefer concrete choices over vague discussion
- Propose 2-3 approaches with tradeoffs and a recommendation
- Keep the design proportional to the task; simple ideas only need a short design
- Follow the existing codebase and product patterns when brainstorming changes to an existing project

## Workflow

### 1. Understand Context First

Before proposing solutions:

- Inspect the relevant code, docs, or task context
- Identify constraints from the existing system
- Notice whether the request is actually multiple problems that should be split apart

If the idea is too broad for one pass, say so and help the user split it into smaller parts.

### 2. Clarify the Goal

Ask focused questions to understand:

1. What problem this solves
2. Who it is for
3. What constraints matter
4. What success looks like

Prefer multiple-choice questions when they make the decision easier.

### 3. Offer Approaches

Once the goal is clear, present 2-3 viable approaches.

For each approach, cover:

- What it is
- Why it would work
- Main tradeoffs
- Complexity level

Lead with the recommended option and explain why it is the best fit.

### 4. Present the Proposed Direction

After discussing options, summarize the recommended design in a compact structure such as:

- Scope
- User experience or workflow
- Main components or responsibilities
- Data flow or state changes
- Failure cases or edge cases
- Testing or validation strategy

Ask for confirmation before switching from brainstorming to implementation.

## Output Style

- Keep the conversation collaborative and concrete
- Avoid giant speculative writeups before you understand the problem
- Scale the detail to the size of the task
- Call out assumptions clearly

## Transition to Execution

When the user approves a direction:

- If they want planning, use the relevant planning workflow or create a concise execution plan
- If they want implementation, switch out of brainstorming mode and start making changes

If the approved direction reveals substantial work, prefer writing down the plan before editing code.
