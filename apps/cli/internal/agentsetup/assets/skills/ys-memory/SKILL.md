---
name: ys-memory
description: Keep .my-context/MEMORY.md up to date with your personal project context. Use when asked to update memory, record a decision, or after a session where you learned something non-obvious.
metadata:
  tool: yishan
  scope: project-memory
---

## What I do

I manage `.my-context/MEMORY.md` — your personal working memory for this project.
It records where you left off, decisions you have already made, and things you
discovered about the codebase. The agent reads it at the start of every session
so you do not have to re-explain context.

`.my-context/` is personal and never committed. It is excluded from git
automatically by yishan.

## When to use me

- You want to record a decision so the agent does not re-open it
- You discovered something non-obvious and want the agent to remember it
- You are ending a session and want to capture where you left off
- The agent is getting something wrong that you have already figured out

## MEMORY.md structure

Three sections. Do not add more — if something does not fit, it probably
belongs in a dedicated `.my-context/` doc instead.

```markdown
# Project Memory

_Last updated: YYYY-MM-DD_

## Where I Left Off
<!-- Current focus, what is in progress, any dead ends hit.
     Rewrite this section each session rather than appending. -->

## My Decisions
<!-- Choices already made so the agent does not re-open them.
     Format: YYYY-MM-DD — <decision and why> -->

## What I Learned
<!-- Non-obvious discoveries about this codebase.
     Things the agent keeps getting wrong or that took effort to figure out. -->
```

## Rules

1. **Read the file before writing** — always edit, never overwrite blind.
2. **Where I Left Off is rewritten each session** — it reflects now, not history.
3. **My Decisions only grows** — remove an entry only if you reverse the decision.
4. **What I Learned only grows** — remove an entry only if it is no longer true.
5. **Keep it short** — if an entry needs more than 2–3 lines, write a dedicated
   `.my-context/` doc and link to it from here.
6. **Update the timestamp** on every write.

## Workflow

### At the start of a session

The hook injects `MEMORY.md` automatically. Read it, then proceed. If anything
in it is outdated, correct it before starting work.

### At the end of a session

1. Rewrite **Where I Left Off** to reflect the current state.
2. Add to **My Decisions** for any choices made that the agent should not revisit.
3. Add to **What I Learned** for anything non-obvious discovered.
4. Update the timestamp.

### Creating for the first time

If `MEMORY.md` does not exist, create it from the template and fill in whatever
you already know. Leave sections empty rather than inventing content.
