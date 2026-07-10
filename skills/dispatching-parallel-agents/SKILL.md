---
name: dispatching-parallel-agents
description: Use when you have two or more independent tasks, failures, or investigations that can be worked on concurrently without shared state or sequential dependencies.
---

# Dispatching Parallel Agents

Use this skill when multiple independent problems can be split into separate agent tasks and run concurrently.

## Why This Skill Exists

This skill is about parallelism, not plan execution.

Use it when one agent would otherwise investigate or implement several unrelated things in sequence even though they do not depend on each other.

## When to Use This Skill

Use this skill when:

- two or more failures have different root-cause areas
- multiple subsystems need investigation and they do not overlap
- several tasks can be completed without editing the same files or relying on the same intermediate state
- parallel execution will save time without increasing coordination risk

Examples:

- three failing test files in unrelated subsystems
- separate debugging tasks in different packages
- independent code review or research tasks

## Do Not Use This Skill When

- tasks depend on each other
- fixing one issue may change the others
- agents would touch the same files or shared mutable state
- the work needs one coherent view of the entire system first
- a plan requires strict sequential task order

In those cases, use `executing-plans` or `subagent-driven-development` instead.

## Core Pattern

### 1. Identify Independent Domains

Before dispatching anything, group work by problem domain.

Each parallel task should have:

- a narrow scope
- a clear boundary
- minimal overlap with the others

If you cannot explain why two tasks are independent, do not parallelize them.

### 2. Create Focused Dispatches

Each agent should receive:

- the exact scope
- the goal
- the relevant files, errors, or inputs
- the constraints
- the expected output format

Do not give every agent the whole session history.

### 3. Dispatch Concurrently

Launch all independent agent tasks in the same response so they run in parallel.

Use role-appropriate agents when available, for example:

- `Explorer` for codebase search or investigation
- `builder` for independent implementation tasks
- `task-reviewer` or `code-reviewer` for separate review scopes

### 4. Review And Integrate

When the agents return:

- read each result carefully
- check for overlapping edits or contradictory conclusions
- integrate only after confirming they do not conflict
- run the broader verification needed for the combined result

## Good Parallel Task Design

Good dispatches are:

- focused on one domain
- self-contained
- explicit about constraints
- explicit about what the agent should return

Bad dispatches are:

- "fix everything"
- "look into all the failures"
- tasks that silently compete for the same files

## Relationship To Other Local Skills

- `executing-plans` = execute one plan inline, sequentially
- `subagent-driven-development` = execute one plan with isolated sequential task handoffs
- `dispatching-parallel-agents` = split multiple independent scopes and run them concurrently

These skills complement each other rather than replacing each other.

## Red Flags

Do not:

- parallelize tasks that share files or mutable state
- assume failures are independent without checking
- give agents vague goals
- skip the integration check after agents finish
- use parallelism just because it feels faster

## Bottom Line

Parallel agents are useful when the work is truly independent. Split by problem domain, dispatch with narrow context, then review and integrate carefully.
