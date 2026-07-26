---
name: context-memory
description: Use when searching or updating durable project memory in `.my-context/`, especially `MEMORY.md`, architecture notes, or other cross-task context that should survive beyond the current task.
---

# Context Memory

Use this skill when you need durable knowledge that should survive beyond the current task.

## Why This Skill Exists

Task files explain one work item.

`context-memory` explains what should persist across work items and sessions.

Use this skill when the information is bigger than one task, or when future work will benefit from remembering a non-obvious fact or decision.

## When To Use This Skill

Use this skill when:

- you need to search past project memory before making a decision
- you discovered a non-obvious fact worth preserving across sessions
- you want to record a durable decision so it is not re-opened casually
- you need to update `.my-context/MEMORY.md`
- you need to add or revise `.my-context/architecture/` notes or other memory docs

Do not use this skill for active task notes or execution progress. Use `context-task` for that.

## Core Principle

Project memory should preserve high-value context, not session chatter.

Keep only information that will still matter when the current diff, current task, and current conversation are no longer open.

## Memory Search First

Before making a structural change, reopening a prior decision, or writing a memory update, search existing memory first.

If the `memory_search` tool is available (Pi with `pi-memory` extension), use it directly — it defaults to the current project when `YISHAN_PROJECT_ID` is set.

Fallback CLI command (when running outside Pi):

```bash
yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<1-3 keywords>"
```

Search guidance:

- use 1 to 3 concrete keywords
- if results are too broad, retry with one narrower term
- read the returned files, not just the snippets
- search memory before asking the user to restate history that may already exist

## `MEMORY.md`

`MEMORY.md` is the high-signal summary layer for durable project memory.

Recommended structure:

```markdown
# Project Memory

_Last updated: YYYY-MM-DD_

## Locked Decisions

## Durable Discoveries

## Open Questions
```

### Locked Decisions

Use for durable choices that should not be casually reopened.

Suggested entry shape:

```markdown
- YYYY-MM-DD - <decision>. Why: <reason>.
```

### Durable Discoveries

Use for non-obvious facts that are likely to save time or prevent mistakes later.

Prefix each item with one label:

- `[Root Cause]`
- `[Invariant]`
- `[Workflow Trap]`
- `[Env Trap]`
- `[Test Trap]`

### Open Questions

Use for unresolved questions worth resurfacing later.

Remove them once answered.

## Rules For `MEMORY.md`

- Read the file before editing it
- Edit carefully; do not overwrite blindly
- Do not use it as a session diary
- Do not duplicate active task state that already belongs in task files
- Deduplicate before adding new entries
- Keep entries short and self-contained
- Update the timestamp on every meaningful write
- If an item needs multiple paragraphs, move it into a dedicated `.my-context/` document and reference that instead

## Keep / Drop Guide

Keep:

- decisions that should not be re-litigated repeatedly
- root causes that took real effort to discover
- invariants that future edits could plausibly break
- recurring workflow, environment, or test traps
- unresolved questions worth resurfacing later

Drop:

- play-by-play implementation logs
- transient status notes
- details obvious from current code or diff
- task-specific progress that belongs in `notes.md` or `plan.md`
- one-off trivia with no future reuse

## Other Memory Documents

Not all durable memory belongs in `MEMORY.md`.

Use dedicated `.my-context/` docs when the content needs structure, depth, or diagrams.

Examples:

- `.my-context/architecture/` for architectural behavior and system flows
- `.my-context/archive/` for curated overflow or summarized historical material
- other project-specific memory docs when a topic deserves its own file

When updating these docs:

- keep them aligned with the current codebase
- prefer concise factual updates over broad rewrites
- search for existing docs before creating a new parallel one

## Deciding Between Task Notes And Memory

Write to task-local files when the information is mainly about the current work item.

Write to project memory when:

- a future task will likely need this
- the fact is costly to rediscover
- the decision should constrain future edits
- the knowledge applies beyond one ticket or branch

Simple test:

Ask whether future work would still benefit from this fact if the current task folder were never opened again.

If yes, it probably belongs in project memory.

## Update Timing

Update memory when the durable information becomes clear.

Do not wait until the end if the insight may be lost.

Good times to update memory:

- after identifying a real root cause
- after making a decision that should constrain future work
- after discovering a recurring test or environment trap
- when finishing a task that changed important architecture knowledge

## Red Flags

Do not:

- dump task notes into `MEMORY.md`
- preserve duplicate or stale entries
- store low-value noise because "maybe it helps later"
- create parallel architecture docs without checking what already exists
- record a decision without enough context to understand why it exists

## Bottom Line

Use `context-memory` to search, maintain, and extend the durable knowledge in `.my-context/` so future work starts with the right context instead of rediscovering it.
