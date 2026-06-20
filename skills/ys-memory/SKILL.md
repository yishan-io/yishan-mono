---
name: ys-memory
description: Manage .my-context/MEMORY.md and search project memory. Use when asked to update memory, record a decision, search past context, or after a session where you learned something non-obvious.
metadata:
  tool: yishan
  scope: project-memory
---

## What I do

I manage `.my-context/MEMORY.md` — your personal working memory for this project.
It records only durable, high-value context: decisions you have already made,
non-obvious discoveries worth preserving, and unresolved questions that should
resurface later. The agent reads it at the start of every session so you do not
have to re-explain context.

`.my-context/` is personal and never committed. It is excluded from git
automatically by yishan.

## When to use me

- You want to record a decision so the agent does not re-open it
- You discovered something non-obvious and want the agent to remember it
- You want to preserve an unresolved question that should resurface later
- The agent is getting something wrong that you have already figured out

## MEMORY.md structure

Three sections. Do not add more — if something does not fit, it probably
belongs in a dedicated `.my-context/` doc instead.

```markdown
# Project Memory

_Last updated: YYYY-MM-DD_

## Locked Decisions
<!-- Durable choices already made, so the agent does not re-open them.
     Format: YYYY-MM-DD — <decision>. Why: <reason>. -->

## Durable Discoveries
<!-- High-value, non-obvious facts only.
     Prefix each item with one label:
     [Root Cause] [Invariant] [Workflow Trap] [Env Trap] [Test Trap] -->

## Open Questions
<!-- Short-lived unresolved questions worth resurfacing next session.
     Remove once answered. -->
```

## Rules

1. **Read the file before writing** — always edit, never overwrite blind.
2. **Do not use MEMORY.md as a session diary** — active work belongs in task docs,
   workspaces, git diff, or dedicated `.my-context/` notes.
3. **Do not duplicate active state** that is already visible elsewhere.
4. **Locked Decisions only keep durable choices** — remove an entry only if you
   reverse the decision.
5. **Durable Discoveries only keep future-useful facts** — remove an entry only if
   it is no longer true.
6. **Every Durable Discovery must include one type label**:
   `[Root Cause]`, `[Invariant]`, `[Workflow Trap]`, `[Env Trap]`, or `[Test Trap]`.
7. **Use the future-me test** — ask: `Will future me need this if task docs and code
   are not open?` If no, do not store it here.
8. **Deduplicate before appending** — never keep the same fact twice with slightly
   different wording.
9. **Keep it short** — if an entry needs more than 2–3 lines, move it to a dedicated
   `.my-context/` doc and link to it.
10. **Archive overflow as curated summaries** — normalize headings and dedupe before
    writing to `.my-context/archive/`.
11. **Update the timestamp** on every write.

## Keep / Drop Guide

Keep:

- Decisions that should not be re-opened casually
- Root causes that took real investigation to uncover
- Invariants the agent might break by making a plausible but wrong change
- Environment, workflow, or test traps that can waste time repeatedly
- Unresolved questions that should be resurfaced later

Drop:

- Play-by-play task logs
- "tests ready to run" or other transient status notes
- Facts already obvious from current code or a git diff
- PR/merge bookkeeping unless it changes future work
- One-off implementation details with no reuse value

## Workflow

### At the start of a session

Before ANY other action:
1. Read `.my-context/MEMORY.md`
2. Read `~/.yishan/memory/PERSONA.md` if it exists — this is your global developer
   persona. Use it to silently calibrate response style, code style, and workflow
   preferences for this user. Do not surface the persona content verbatim; let it
   inform your behaviour naturally. If this host is operating under remote-host /
   service-token policy and `YISHAN_REMOTE_HOST_POLICY=1` is present in the
   environment, skip PERSONA.md entirely — persona is user-level context and is
   disabled in that mode.
3. If anything in MEMORY.md is stale, duplicate, or no longer durable — correct it first

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
2. Use the correct section and keep the entry self-contained
3. For Durable Discoveries, include a type label
4. Don't wait — you might be interrupted
5. If sections grow too large, move older entries to `.my-context/archive/<category>-<date>.md` (for example `archive/decisions-20260614.md`) as a curated, deduplicated overflow file. Leave an index line such as `- See archive/<category>-<date>.md (N items)`.

### At the end of a session

The daemon also runs automatic summarization when the session stops (via hook → external LLM → write MEMORY.md). This catches what you forgot to write. Your manual writes help, but are supplemented by this auto-capture.

1. Add to **Locked Decisions** for any choices the agent should not revisit.
2. Add to **Durable Discoveries** for any high-value non-obvious facts discovered.
3. Add to **Open Questions** only for unresolved items worth resurfacing later.
4. Remove stale or duplicate entries.
5. Update the timestamp.

### Creating for the first time

If `MEMORY.md` does not exist, create it from the template and fill in whatever
you already know. Leave sections empty rather than inventing content.
