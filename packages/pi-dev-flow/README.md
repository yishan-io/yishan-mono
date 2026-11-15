# @yishan-io/pi-dev-flow

Pi skills for design discussion, planning, debugging, testing, code review, subagent work, and Excalidraw editing.

## Default Workflow

Inspect the relevant code, make the scoped change, and run focused verification. Skills are methods to use when needed, not stages to run in sequence. Multiple steps or files alone do not require a formal plan, tracked task, or subagents.

The hard rules (align before editing, heartbeat every 10 tool calls, scope gate, stop rule, closing diff check, closing report, and the Task record moments) live in one place: the "Working agreement" section of `apps/cli/internal/agent/setup/assets/pi-agent/APPEND_SYSTEM.md`. The skills below add method-specific limits and refer to those rules. Edit the rules there, not in each skill.

Concrete limits used by the skills:

- Debugging: stop after 3 tested hypotheses, 20 tool calls, or 3 identical failures.
- Delegation: every handoff has Goal, Done when, Out of scope, Files, Stop rule, and Report format. The coordinating agent checks `git diff --stat` after every return. Dispatch the same scope at most twice.
- Review: at most 2 independent rounds per change. The reviewer lists UNPLANNED files.
- Plans: a plan with a `NEEDS APPROVAL` decision, an architecture or data-format change, or a migration waits for the user.

## Skills

| Skill | When to use it |
| --- | --- |
| `brainstorm` | Resolve unclear goals or meaningful design choices. |
| `writing-plans` | Plan architecture choices, complex dependencies, migrations, or a user-requested plan. |
| `systematic-debugging` | Investigate failures whose causes are unclear. |
| `test-driven-development` | Guide testable behavior changes with a failing test. |
| `code-review` | Review substantial changes and evaluate review feedback. |
| `subagent-driven-development` | Delegate useful independent scopes, including safe parallel work. |
| `editing-whiteboards` | Create or edit Excalidraw scenes. |

## Skill Consolidation

`code-review` replaces `requesting-code-review` and `receiving-code-review`. Parallel delegation guidance now lives in `subagent-driven-development` instead of `dispatching-parallel-agents`.

Update saved prompts or explicit `/skill:` commands that use the retired names. The package skill directory is discovered automatically.

The managed default instructions live in `apps/cli/internal/agent/setup/assets/pi-agent/APPEND_SYSTEM.md`. Local Task guidance lives in `packages/pi-task/skills/`. These sources use the same lightweight defaults.

Source edits do not automatically update an installed package or an existing session. Update the installed package and managed instructions through the normal setup flow, then reload skills or start a new session as appropriate.
