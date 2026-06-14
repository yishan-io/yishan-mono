---
name: ys-memory
description: Manage .my-context/MEMORY.md and search project memory. Use when asked to update memory, record a decision, search past context, or after a session where you learned something non-obvious.
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

Before ANY other action:
1. Read `.my-context/MEMORY.md`
2. If anything outdated — correct it first

### During a session

When you need to look up any project context — past session memory,
architecture decisions, task history, learned discoveries, etc. — all indexed
from `.my-context/`:
1. Run `yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<query>"` from the workspace root. Use 1-3 keywords.
2. Read the returned paths for full content.
3. If search returns 0 — retry with fewer/rarer terms.

**Command:** `yishan memory search --output json --project-id $YISHAN_PROJECT_ID <query>`

| Flag | Type | Default | Description |
|---|---|---|---|
| `--output` | string | default | Set to `json` for machine-readable output |
| `--project-id` | string | `$YISHAN_PROJECT_ID` | Project ID (falls back to env var) |
| `--scope` | string | project | `project` or `global` |
| `--limit` | int | 20 | Max results (capped at 100) |

Returns a JSON array of `{path, snippet, score}` objects. The `snippet`
wraps matching terms in `<mark>` tags and `score` is the FTS5 relevance rank (lower is better).

**Example:**

```bash
yishan memory search --output json --project-id $YISHAN_PROJECT_ID "permission deadlock"
```
```json
[
  {
    "path": "/Users/…/workspace/.my-context/MEMORY.md",
    "snippet": "...fixed the <mark>permission</mark> <mark>deadlock</mark> by...",
    "score": 0.15
  },
  {
    "path": "/Users/…/workspace/.my-context/architecture/decisions-20260614.md",
    "snippet": "...resolved a <mark>deadlock</mark> when checking <mark>permission</mark>...",
    "score": 0.42
  }
]
```

The returned paths are absolute. Read them to get the full content.

When you discover something worth keeping across sessions:
1. Edit `.my-context/MEMORY.md` immediately
2. Format: `- YYYY-MM-DD — <description>`
3. Don't wait — you might be interrupted
4. If sections grow too large — the daemon budget guard automatically moves overflow to `.my-context/archive/<category>-<date>.md` (e.g. `archive/decisions-20260614.md`). You can manually extract older entries this way too. Leave an index line: `- See archive/<category>-<date>.md (N items)`

### At the end of a session

The daemon also runs automatic summarization when the session stops (via hook → external LLM → write MEMORY.md). This catches what you forgot to write. Your manual writes help, but are supplemented by this auto-capture.

1. Rewrite **Where I Left Off** to reflect the current state.
2. Add to **My Decisions** for any choices made that the agent should not revisit.
3. Add to **What I Learned** for anything non-obvious discovered.
4. Update the timestamp.

### Creating for the first time

If `MEMORY.md` does not exist, create it from the template and fill in whatever
you already know. Leave sections empty rather than inventing content.
