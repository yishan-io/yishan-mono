---
name: ys-start
description: Start a new task in .my-context/tasks/. Create a ticket folder with task.md and register it in state.json.
metadata:
  tool: yishan
  scope: task-management
---

## What I do

I create a new task folder under `.my-context/tasks/active/` and register it in
`state.json`. This is the first step in the task workflow — after this, use
`ys-research` to investigate, then `ys-plan`, `ys-build`, `ys-verify`, and
finally `ys-done` to complete the task.

`.my-context/` is personal and never committed. It is excluded from git
automatically by yishan.

## When to use me

- The user asks to create a new task or track a piece of work
- A ticket (GitHub, GitLab, Linear, Jira) needs a local task folder
- Before starting any of the other task workflow skills

## Primary rule

- If the user does not provide a title, goal/description, or acceptance
  criteria, generate them from the user's request as the default behavior.
- Treat asking the user for missing task details as the fallback, not the
  primary path.
- Keep the generated title concise and specific.
- Keep the generated goal focused on what should change and why.
- Keep the generated acceptance criteria concrete and verifiable.
- The user can revise any generated task content later.

## Session environment

Every terminal session started by yishan has these variables in its environment:

| Variable | Value |
|---|---|
| `YISHAN_PROJECT_ID` | Project the workspace belongs to |

## Folder structure

```
.my-context/tasks/
  state.json                 — task index (source of truth for status)
  active/
    <id>-<slug>/
      task.md                — goal, ticket reference, acceptance criteria
```

## Task IDs

- If the task has a ticket ID (e.g. from Linear, Jira, GitHub): use it as-is — `PROJ-123`
- If there is no ticket: generate a short random ID — 3 lowercase letters + 2 digits, e.g. `xkf42`
- Folder name is always `<id>-<slug>` where slug is the title lowercased, spaces replaced with hyphens, truncated to 40 chars — e.g. `PROJ-123-fix-auth-token-expiry`

## Ticket Auto-Fetch

When the user provides a ticket URL or ID, attempt to fetch the ticket content
automatically to pre-populate `task.md`. This avoids asking the user to retype
information that already exists in the tracker.

### Detection

| Source | URL pattern | Bare ID pattern |
|---|---|---|
| Linear | contains `linear.app` and `/issue/` | `^[A-Z]+-\d+$` |
| GitHub | contains `github.com` and `/issues/` | plain number (needs repo context) |
| GitLab | contains `gitlab.` and `/-/issues/` | plain number (needs repo context) |
| Jira | contains `atlassian.net/browse/` | `^[A-Z]+-\d+$` |

Linear and Jira share the same bare-ID format (`^[A-Z]+-\d+$`). A URL is always
unambiguous. For bare IDs, attempt the Linear CLI first; if it fails with a
not-found error, try Jira.

### Fetch — priority order per source

Try each option in order and stop at the first success. If all options fail or
no tool is available, generate the missing task details from the user's request
instead of blocking on follow-up questions unless the request is too ambiguous
to infer safely.

**Linear**
1. MCP: call `mcp__linear__get_issue` with the issue ID.
2. CLI: `linear issue view <id> --json`

**GitHub**
1. MCP: call `mcp__github__get_issue` with owner, repo, and number.
2. CLI: `gh issue view <url>` (URL is self-contained) or
   `gh issue view <number> --repo owner/repo --json title,body,labels`

**GitLab**
1. CLI: `glab issue view <id> --output json` (run from the repo directory).
2. MCP: tool name varies by configured server — use if available.

**Jira**
1. MCP: call `jira_get_issue` with the issue key (requires `sooperset/mcp-atlassian`).
2. CLI: `acli jira workitem view <id> --json` (official Atlassian CLI).

### Field mapping

| task.md field | Linear | GitHub / GitLab | Jira |
|---|---|---|---|
| Title | `title` | `title` | `fields.summary` |
| Goal | `description` | `body` | `fields.description` |
| Ticket URL | `url` | `url` | `self` / browse URL |
| Acceptance Criteria | Extract checklist items from description | Extract checklist items from body | Extract checklist items from description |

Neither source has a dedicated AC field. If the description/body contains a
markdown checklist (`- [ ] …`), extract those items as the initial AC list.
Otherwise generate an initial AC list from the request/ticket content.

Write `task.md` directly with the fetched content and report what was populated.
The user can edit `task.md` afterwards.

## state.json format

```json
{
  "tasks": [
    {
      "id": "PROJ-123",
      "title": "Fix auth token expiry bug",
      "status": "active",
      "created": "2026-06-11",
      "path": ".my-context/tasks/active/PROJ-123-fix-auth-token-expiry"
    }
  ]
}
```

Fields:
- `id` — ticket ID or generated short ID
- `title` — one-line description
- `status` — `"active"` or `"completed"`
- `created` — ISO date (YYYY-MM-DD)
- `path` — path relative to project root

Rules:
- Always read `state.json` before any task operation. Create it as `{ "tasks": [] }` if missing.
- Always write `state.json` after creating a task.
- Never remove entries — update `status` and `path` instead.
- If `state.json` already exists outside `.my-context/tasks/` (legacy location), read from there but write to `.my-context/tasks/state.json`.

## task.md template

Written when the task is created. Update it if the goal or criteria changes.

```markdown
# <title>

**ID:** <id>
**Ticket:** <url or "none">
**Created:** YYYY-MM-DD
**Status:** active

## Goal

<What needs to be done and why>

## Acceptance Criteria

- <criterion>

## PRs

<!-- Add PR URLs as they are created during ys-build -->
- <url> — <brief description>
```

## Workflow

### Creating a task

1. Read `.my-context/tasks/state.json` (create it if missing — `{ "tasks": [] }`).
2. If the user provided a ticket URL or ID:
   a. Detect the source using the patterns in **Ticket Auto-Fetch**.
   b. Attempt to fetch ticket content (MCP first, then CLI — see fetch priority order).
   c. On success: use the fetched title, description, and any extracted checklist
      items to populate `task.md`. If fields are still missing, generate them
      from the fetched content. Report what was fetched.
   d. On failure or no tool available: generate title, goal, and acceptance
      criteria from the user's request.
   If no ticket was provided: generate title, goal, and acceptance criteria
   from the user's request.
3. Ask follow-up questions only if the request is too ambiguous to infer a
   reasonable task safely.
4. Determine the ID: use the ticket ID if provided, otherwise generate a short random ID.
5. Build the folder name: `<id>-<slug>` (slug = title lowercased, spaces→hyphens, ≤40 chars).
6. Create the folder: `.my-context/tasks/active/<folder>/`.
7. Write `task.md` using the template above.
8. Add entry to `state.json`:

```json
{
  "id": "<id>",
  "title": "<title>",
  "status": "active",
  "created": "<YYYY-MM-DD>",
  "path": ".my-context/tasks/active/<folder>"
}
```

9. Write `state.json`.
10. Report the task path to the user, mention any generated assumptions briefly,
    and suggest the next step: `ys-research`.
