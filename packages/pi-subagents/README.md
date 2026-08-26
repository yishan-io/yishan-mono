# @yishan-io/pi-subagents

Pi sub-agent orchestration package for Yishan.

## What it provides

This package adds a lightweight multi-agent layer on top of Pi using Pi's SDK session APIs.

Current MVP features:
- `@agent:<name>` direct invocation
- Multiple leading `@agent:<name>` tokens with one shared task
- `/agent`, `/agents`, `/agent-result`, `/agent-stop`, `/agent-steer`, `/agent-send`, `/agent-view`
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

## Child-session extensions

Child sessions are isolated: they load with `noExtensions: true`, so settings.json packages do not run inside sub-agents. Extension tools that should reach sub-agents are forwarded explicitly as inline factories via `resolveChildExtensionFactories()` (`src/runtime/childExtensions.ts`). Today this forwards the optional `@yishan-io/pi-lsp` factory (when installed) so `lsp_diagnostics`/`lsp_fix` work in child sessions; any future extension whose tools belong in sub-agents must be added there.

## Agent definition locations

This package ships built-in agents inside the package:
- `general`
- `explore`
- `builder`
- `code-reviewer`
- `plan-reviewer`

User and project full-definition overrides use standard Pi locations:
- User: `<active-agent-dir>/agents/*.md` (normally `~/.pi/agent/agents/*.md`; Yishan-managed sessions use `~/.yishan/pi/agent/agents/*.md`)
- Project: `.pi/agents/*.md`

Model and thinking level are part of the agent definition frontmatter (`model:` / `thinking:`), so a user markdown definition can set them without touching built-in files. A project `.pi/agents/*.md` definition remains the highest-priority full override, including for model and thinking.

> Since 0.2.0 the old `<active-agent-dir>/agent.overrides.json` patch file is no longer read. If you previously used it to set `model`/`thinking`, move those values into the `model:` / `thinking:` frontmatter of the agent definition file.

Override precedence:
1. project markdown definition
2. user markdown definition
3. built-in definition

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
- Default tools: `read`, `grep`, `glob`, `bash`, `apply_patch`, `lsp_diagnostics`, `lsp_fix`
- Default mode: writable when needed
- Default model: unset

### code-reviewer
- Purpose: review code changes for bugs, regressions, and missing tests
- Default tools: `read`, `grep`, `glob`, `bash`, `lsp_diagnostics`
- Default mode: read-only
- Default model: unset

### plan-reviewer
- Purpose: review implementation plans before execution
- Default tools: `read`, `grep`, `glob`
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
```

Keyboard shortcuts:
- `Ctrl+J` opens the live sub-agent viewer selector

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
- a popup live sub-agent viewer via `/agent-view` or `Ctrl+J`

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
