# internal — CLI daemon package map

Current after Phases 13–19 (cli-refactor-4). Every top-level package has one
role; `adapter/` and `platform/` roots contain no Go files and only classify
their children.

## Dependency contract

```text
daemon -> app
app -> node services + rpc + adapters + platform + domain owners
rpc -> service interfaces + domain error mappers
node services -> domain owners + capability interfaces
adapters -> domain vocabulary
domain owners -X-> rpc, daemon, app, adapters
capability owners -X-> rpc, daemon, app
```

Enforced by `internal/archtest` (`TestForbiddenImports`).

## Package roles

| Package | Role | Owns |
|---|---|---|
| `app` | Composition | Service graph construction, startup/shutdown; `appHandler` (router + desktop-connection tracking), `relayHandler` (job.run / workspace snapshot / terminal relay dispatch) |
| `daemon` | Host | Process lifecycle, lock, state file, HTTP serving, daemon client |
| `rpc` | Transport | JSON-RPC/WebSocket server, router, namespace handlers, wire error codes + `MapRPCError` |
| `node/workspace` | Application boundary | `workspace.*`, `file.*`, `git.*` namespaces + workspace lifecycle application ops (create/close/folder/health/hydrate/persist/relay/watch) |
| `node/agent` | Application boundary | `pi.*`, `skill.*`, `customize.*` + task runs, pi session registry, desktop-connection tracking |
| `node/terminal` | Application boundary | `terminal.*` + remote stream state, binary terminal frames |
| `node/project` | Application boundary | `project.*` (list, preferences) |
| `node/system` | Application boundary | `system.*`, `memory.*`, `computer.*`, `context.*` + CLI tool detection, scheduled jobs, memory-summarizer runner |
| `node/hook` | Application boundary | Agent hook HTTP ingress (pi notify bridge), usage tracker |
| `node/context` | Application boundary | Renderer-pushed desktop context store |
| `workspace` | Domain owner | Workspace types + lifecycle rules; `application/` (create/close orchestration), `instance/`, `pr/`, `watchers/`, `worktree/` |
| `agent` | Domain owner | `session/`, `process/`, `command/`, `setup/`, `auth/`, `catalog/`, `kind/` |
| `tokenusage` | Domain owner | `collection/`, `scanner/`, `attribution/`, `pricing/`, `repository/` |
| `memory` | Domain owner | Store, reconcile, summarizer, persona |
| `files` `git` `terminal` `computer` | Capability owners | Standalone local capabilities (standalone = not workspace internals) |
| `adapter/cloud` | Edge adapter | Cloud API client + DTOs; `session/` (auth token state), `login/` |
| `adapter/sqlite` | Edge adapter | SQLite store + migrations + row conversion |
| `adapter/relay` | Edge adapter | Relay envelopes + relay client |
| `platform/config` | Platform | Environment config reading |
| `platform/shellenv` | Platform | Shell environment resolution |
| `platform/logging` | Platform | Log file management |
| `platform/release` | Platform | Version + self-update |
| `events` | Infrastructure | Frontend event hub (eventbus rename deferred until one owner) |
| `archtest` | Test-only | Forbidden-import architecture test |

## Archtest rules (source → forbidden targets)

- `workspace` → daemon, rpc, agent, adapter/cloud, adapter/sqlite,
  adapter/relay, node (the workspace domain depends only on interfaces)
- `rpc` → daemon, node, agent
- `files` / `git` / `terminal` / `computer` → daemon, rpc, agent, node
  (standalone capabilities, domain errors only)
- `workspace/worktree` → daemon, rpc, agent, node
- `agent` → daemon, node, rpc
- `adapter/cloud` / `adapter/sqlite` → daemon, rpc, node, agent
- `adapter/relay` → daemon, node, agent (may use rpc transport types)
- `node` → daemon, app (node services never import the composition root)
- `node/id`, `agent/kind`, `git/exec` → their owner package (no reverse import)
- `tokenusage` subpackages → each other's orchestrators (leaf owners)
- `memory`, `events` → daemon, rpc, node, agent

## Error ownership

- Domain/capability owners return their own errors: `workspace.Error`,
  `files.Error`, `git.Error`, `worktree.Error`, `terminal.Error`,
  `computer.Error`.
- `rpc.MapRPCError` maps domain errors to wire codes; `rpc` owns the
  JSON-RPC numeric codes; `cmd/output` owns process exit-code policy
  (`CodeToExitCode`).
- Services never return raw `error` strings; typed `AppError`-style domain
  errors only.

## Test filename and ownership rules

- Unit test = production-file stem; use-case test = use-case name
  (`create_test.go`); contract test = port name (`store_contract_test.go`);
  integration test = flow name; support = `test_support_test.go`.
- No test file exceeds 500 lines — split by behavior, not line count.
- Test names never reference removed owners (`Manager`, `Dispatch`, `Handle`
  RPC prefixes).
- Per-file owner matrix: `internal/test-ownership.md` (Phase 17A).
