# @yishan-io/pi-subagents

Pi sub-agent orchestration package for Yishan.

## What it provides

This package adds a lightweight multi-agent layer on top of Pi using Pi's SDK session APIs.

Current MVP features:
- `@agent:<name>` direct invocation
- Multiple leading `@agent:<name>` tokens with one shared task
- `/agent`, `/agents`, `/agent-result`, `/agent-stop`, `/agent-steer`, `/agent-send`, `/agent-view`, `/agent-view-clear`
- Main-agent `Agent` tool for delegation
- User/project agent overrides
- Background runs, stop/steer support, and persisted child sessions in the shared Pi session store
- Live TUI footer status and progress widget for queued/running agents
- Read-only-aware concurrency control

## Installation

As a Pi package:

```bash
pi install /absolute/path/to/packages/pi-subagents
```

Or from a checked-out monorepo path:

```bash
pi install ./packages/pi-subagents
```

The package manifest exposes the extension from `./extensions`.

## Agent definition locations

This package ships built-in agents inside the package:
- `general`
- `explore`
- `builder`
- `code-reviewer`
- `plan-reviewer`
- `task-reviewer`

User and project overrides still use standard Pi locations:
- User: `~/.pi/agent/agents/*.md`
- Project: `.pi/agents/*.md`

Override precedence:
1. project
2. user
3. built-in

## Built-in agents

### general
- Purpose: general-purpose implementation and investigation
- Default tools: unset (falls back to the user's normal Pi tool/session resolution)
- Default mode: writable when needed
- Default model: unset (falls back to the user's normal Pi session/model resolution)

### explore
- Purpose: search and understand the codebase
- Default tools: `read`, `grep`, `find`, `ls`
- Default mode: read-only
- Default model: unset (falls back to the user's normal Pi session/model resolution)

### builder
- Purpose: implement one scoped task from a plan or task brief
- Default tools: `read`, `grep`, `glob`, `bash`, `apply_patch`
- Default mode: writable when needed
- Default model: unset

### code-reviewer
- Purpose: review code changes for bugs, regressions, and missing tests
- Default tools: `read`, `grep`, `glob`, `bash`
- Default mode: read-only
- Default model: unset

### plan-reviewer
- Purpose: review implementation plans before execution
- Default tools: `read`, `grep`, `glob`
- Default mode: read-only
- Default model: unset

### task-reviewer
- Purpose: review one task-sized implementation for requirements compliance
- Default tools: `read`, `grep`, `glob`, `bash`
- Default mode: read-only
- Default model: unset

## Usage

### Direct invocation

`@agent:` is shorthand for the main agent to delegate through the `Agent` tool, receive the sub-agent result, and continue the work. The original shorthand stays visible in the transcript; the expanded delegation prompt is applied only to LLM context.

Single agent:

```text
@agent:explore investigate how authentication works
```

Multiple agents with one shared task:

```text
@agent:explore
@agent:general

Investigate the current authentication implementation.
```

### Slash commands

```text
/agents
/agent explore inspect the auth flow
/agent explore --background inspect the auth flow
/agent-result agent-abc123
/agent-stop agent-abc123
/agent-steer agent-abc123 focus on tests too
/agent-send agent-abc123
/agent-view
/agent-view agent-abc123
/agent-view-clear
```

Keyboard shortcuts:
- `Ctrl+J` opens the sub-agent detail selector
- double `Esc` clears the selected sub-agent detail panel

### Main-agent tool

The package registers an `Agent` tool for the main agent:

```ts
Agent({
  agent: "explore",
  prompt: "Investigate authentication",
  background: true,
})
```

Foreground runs return the child agent response.
Background runs return the new agent id immediately.
Completed background results are not auto-injected back into the main agent; use `/agent-send <agent-id>` (or `/agent-send` for all completed runs) to hand them back manually.
`/agent-steer` applies only to a currently running agent, and this MVP does not expose an OpenCode-style resumable `task_id` flow.

## Live progress in TUI

While agents are queued or running, the extension shows:
- a footer status like `🤖 1 running · 2 queued`
- a widget above the editor listing active agent ids, names, and modes
- an optional selected-agent detail panel below the editor via `/agent-view`

## Child session persistence

Each sub-agent run now persists as a normal Pi session under the shared Pi session store (for example under `~/.yishan/pi/agent/sessions/...` in Yishan-managed environments).

The child session stores:

- normal Pi session history
- `parentSession` linkage back to the main session
- child metadata such as agent id, title, and summary

The parent session also records child-reference metadata so the relationship can be reconstructed later.

## Current MVP limitations

- Autocomplete uses a flat merged list with clear `Agent · ...` labels; it does not yet render explicit grouped `Agents` / `Files` sections.
- Child sessions intentionally disable extension loading to avoid recursive self-loading; they still use Pi SDK sessions, context files, and normal tool/session infrastructure.
- Session-history list filtering/classification for parent vs child sessions is intentionally deferred to a separate follow-up task.
- Built-in agent definitions are loaded from this package manually because Pi packages do not auto-discover agent-definition directories.
- The package currently exposes only the single-agent `Agent` tool; result/stop/steer remain slash-command driven, and background-result handoff remains manual via `/agent-send`.
- The progress widget is intentionally lightweight for MVP; it does not yet stream rich per-agent session history or provide a dedicated selector/details pane.
- Child runs are fresh Pi SDK sessions; this MVP does not expose an OpenCode-style resumable `task_id`/session-resume API.

## License

This package is licensed under the MIT License. See [`LICENSE`](./LICENSE).

## Development

Package-local checks:

```bash
bun run --cwd packages/pi-subagents typecheck
bun run --cwd packages/pi-subagents lint
bun run --cwd packages/pi-subagents test
```
