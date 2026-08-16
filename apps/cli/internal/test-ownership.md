# CLI Test Ownership Matrix

Phase 17A deliverable — one row per test file under `apps/cli/internal`
(124 files, checked 2026-08-16 on `cli-refactor-4`).

## Legend

| Field | Meaning |
|---|---|
| Type | unit, use case, contract, integration, live, support |
| Current owner | Package that owns the test now |
| Target owner | Package that must own the behavior (Phase 18/19 target layout) |
| Private access | Uses unexported symbols of the owner package (`package foo` tests) |
| Duplicate | Another suite covers the same behavior |
| Action | keep, rename, move, split, rewrite, remove |

Test-type rules: unit uses the production-file stem; use case uses the
use-case name; contract uses the port name; integration uses the flow name;
support uses `test_support_test.go`. Names must not use removed owners
(`Manager`, `Dispatch`, `Handler`).

Move rules: production code and its tests move in the same change; a test
moves only with its behavior owner; helpers stay with their single consumer.

## app — Composition owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| app/cleanup_retry_test.go | 73 | use case | Pending workspace cleanup retry marks workspace closed | app (keep) | yes | — | keep |
| app/memory_test.go | 74 | use case | Memory DB init: old-DB migration, new path, both-exist preference | app (keep) | yes | — | keep |
| app/startup_test.go | 179 | integration | Bootstrap startup sequence; app close shutdown order | app (keep) | yes | — | keep |
| app/watchers_test.go | 331 | use case | Event-hub watcher sink, file-cache invalidation, health rewatch | app (keep) | yes | — | keep |

## agent — Domain owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| agent/auth/ambient_test.go | 231 | unit | Ambient Bedrock/Vertex provider detection; store includes ambient | agent/auth (keep) | yes | — | keep |
| agent/auth/store_test.go | 405 | unit | Auth store save/remove/list, lock steal, corrupt-file errors | agent/auth (keep) | yes | — | keep |
| agent/catalog/detect/agent_detection_test.go | 459 | use case | CLI detection statuses, version probes, shell resolution, TTL cache | agent/catalog/detect (keep) | yes | — | keep |
| agent/catalog/detect/github_detection_test.go | 61 | unit | gh CLI version detection + fallback | agent/catalog/detect (keep) | yes | — | keep |
| agent/catalog/fetcher_cli_test.go | 268 | unit | pi models fetcher, binary resolution, model-capability merge | agent/catalog (keep) | yes | — | keep |
| agent/catalog/fetcher_opencode_test.go | 132 | unit | opencode models fetch + parse + stderr wrapping | agent/catalog (keep) | yes | — | keep |
| agent/catalog/install/clitoolinstall_test.go | 145 | use case | CLI tool registry, pi/yishan installer symlinks, refusal rules | agent/catalog/install (keep) | yes | — | keep |
| agent/catalog/install/pi_test.go | 74 | unit | npm registry version parse/fetch/cache | agent/catalog/install (keep) | yes | — | keep |
| agent/command/command_builder_test.go | 266 | unit | Run-command construction per agent kind + env resolution | agent/command (keep) | no (external pkg) | — | keep |
| agent/kind/kind_test.go | 14 | unit | Token-scanner flag on pi kind | agent/kind (keep) | yes | — | keep |
| agent/process/manager_test.go | 437 | use case | Process start/stop lifecycle, stdout cleanup, events, cancellation | agent/process (keep) | yes | — | keep |
| agent/process/session_history_test.go | 263 | unit | Session summary listing, transcript path resolution, CWD encoding | agent/process (keep) | yes | — | keep |
| agent/session/registry_test.go | 109 | unit | Session registry attach/delete, stopping markers, waiters | agent/session (keep) | yes | — | keep |
| agent/setup/hook_setup_test.go | 225 | use case | Managed hook assets, shell wrappers, pi-agent-dir env | agent/setup (keep) | yes | — | keep |
| agent/setup/hooks/setup_test.go | 427 | use case | Agent hook setup merge (claude/gemini/opencode), persona injection guards | agent/setup/hooks (keep) | yes | — | keep |
| agent/setup/pi_agent_setup_test.go | 274 | use case | Sync managed pi agents, default extension setup/removal | agent/setup (keep) | yes | — | keep |
| agent/setup/pi_agents_test.go | 564 | use case | Pi agent create/update/remove/restore, front matter rules, sync rules | agent/setup (keep) | yes | — | split >500 in Phase 20 |
| agent/setup/pi_extensions_test.go | 676 | use case | Pi extension list/classify/update-check, git-source install, pi command env | agent/setup (keep) | yes | — | split >500 in Phase 20 |
| agent/setup/skill_cli_test.go | 315 | use case | Skill install/remove via CLI, tracked/untrusted rules, sanitized names | agent/setup (keep) | yes | — | keep |
| agent/setup/skill_discovery_test.go | 404 | use case | Skill dir scanning, source precedence, trust rules | agent/setup (keep) | yes | — | keep |
| agent/setup/skill_service_test.go | 126 | use case | Skill list/get/detail resolution, front-matter parsing | agent/setup (keep) | yes | — | keep |

## api — Edge adapter (→ adapter/cloud in Phase 19)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| api/client_test.go | 308 | use case | HTTP raw/refresh flow, token refresh failure classification, proactive refresh | adapter/cloud | yes | — | move with api → adapter/cloud |
| api/methods_test.go | 68 | unit | Create-workspace payload shaping, source-node id inclusion | adapter/cloud | yes | — | move with api → adapter/cloud |
| api/token_test.go | 61 | unit | JWT user-id parsing rules | adapter/cloud | yes | — | move with api → adapter/cloud |
| api/workspace_inputs_test.go | 48 | unit | Create/update/close input mapping | adapter/cloud | yes | — | move with api → adapter/cloud |
| api/workspace_mapper_test.go | 56 | unit | Workspace record ↔ domain conversion | adapter/cloud | yes | — | move with api → adapter/cloud |

## archtest — Test-only

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| archtest/arch_test.go | 287 | contract | Forbidden import edges across internal packages | archtest (keep) | yes | — | keep; update rules with 17B (drop rpcerror), 18/19 moves |

## computer — Capability owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| computer/darwin/capture_test.go | 37 | unit | Capture option normalization, opaque id parse | computer/darwin (keep) | yes | — | keep |
| computer/darwin/discovery_test.go | 42 | unit | Window filter matching, bundle-id enrichment | computer/darwin (keep) | yes | — | keep |
| computer/darwin/runtime_test.go | 33 | unit | Health availability, permission-state mapping (darwin build tag) | computer/darwin (keep) | yes | — | keep |
| computer/mock/runtime_test.go | 29 | unit | Mock runtime defaults | computer/mock (keep) | yes | — | keep |
| computer/runtime_test.go | 36 | unit | Error details, noop runtime unavailability | computer (keep) | yes | — | keep |
| computer/service_test.go | 117 | use case | Approval-gated type/text/clipboard, focus-target errors | computer (keep) | yes | — | keep |

## config — Platform owner (→ platform/config in Phase 19)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| config/account_dir_test.go | 121 | use case | Account data-dir resolution, settings load from account dir | platform/config | yes | — | move with config → platform/config |
| config/migration_test.go | 204 | use case | Legacy viper/context migration into settings store | platform/config | yes | — | move with config → platform/config |

## daemon — Host owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| daemon/account_migration_test.go | 338 | use case | Account-layout migration, memory db move, user-id backfill | daemon (keep) | yes | — | keep |
| daemon/daemon_lock_test.go | 89 | use case | Lock acquisition exclusion, holder pid, release | daemon (keep) | yes | — | keep |
| daemon/process_mgmt_test.go | 201 | use case | Start decision planning, stop pid resolution, lock/state preference | daemon (keep) | yes | — | keep |
| daemon/process_mgmt_unix_test.go | 54 | integration | Stop-process signals + helper process (unix build tag) | daemon (keep) | yes | — | keep |
| daemon/process_test.go | 106 | use case | Profile db init, remote-host policy, memory summarizer config | daemon (keep) | yes | — | keep |
| daemon/remote_sync_test.go | 72 | unit | Reauth-required error detection, message formatting | daemon (keep) | yes | — | keep |
| daemon/state_runtime_test.go | 50 | use case | State file load, stale-state removal for dead process | daemon (keep) | yes | — | keep |

## db — Edge adapter (→ adapter/sqlite in Phase 19)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| db/db_test.go | 338 | use case | Schema open/migrate, legacy metadata cleanup, 008 migration | adapter/sqlite | yes | — | move with db → adapter/sqlite |
| db/hourly_usage_store_test.go | 296 | use case | Hourly usage merge/sync semantics, backfill cutoff, dirty rows | adapter/sqlite | yes | — | move with db → adapter/sqlite |
| db/project_list_preferences_test.go | 223 | use case | Project list preference store: round-trip, org isolation, prune, legacy migration | adapter/sqlite | yes | — | move with db → adapter/sqlite |
| db/store_test.go | 151 | contract | Workspace store list/update/status conversions, not-found sentinel | adapter/sqlite | yes | — | move with db → adapter/sqlite |
| db/workspace_cleanup_test.go | 180 | use case | Cleanup store add/list/remove, retry history, legacy file import | adapter/sqlite | yes | — | move with db → adapter/sqlite |
| db/workspace_mapper_test.go | 70 | unit | Workspace row ↔ domain conversion | adapter/sqlite | yes | — | move with db → adapter/sqlite |
| db/workspace_store_test.go | 223 | use case | Workspace store CRUD, duplicate-active rejection, folder store rules | adapter/sqlite | yes | — | move with db → adapter/sqlite |

## events — Infrastructure (→ eventbus after rename, Phase 19)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| events/hub_test.go | 37 | unit | Hub publish does not drop slow subscriber on overflow | eventbus | yes | — | move with events → eventbus rename |

## files — Capability owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| files/file_search_test.go | 272 | use case | Search: context files, fuzzy matching, ignore rules, limit/ordering | files (keep) | yes | — | keep |
| files/file_service_test.go | 954 | use case | File CRUD, path-escape/symlink rules, git-ignore listing, diff, cache invalidation | files (keep) | yes | — | split >500 in Phase 20 |

## fswatch — Single-owner (→ workspace/watchers/fswatch in Phase 19)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| fswatch/fswatch_fsevents_test.go | 42 | unit | FSEvents recursive path emission rules (darwin build tag) | workspace/watchers/fswatch | yes | — | move with fswatch |
| fswatch/fswatch_test.go | 38 | unit | Watcher creation, path dedupe/canonicalize | workspace/watchers/fswatch | yes | — | move with fswatch |

## git — Capability owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| git/git_service_test.go | 917 | use case | Status/commit/queries, PR bind/merge, change listing, worktree create, ref resolution | git (keep) | yes | — | split >500 in Phase 20 |

## logx — Platform owner (→ platform/logging in Phase 19)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| logx/file_test.go | 176 | unit | File writer rotation, max files, reopen append, parent dirs | platform/logging | yes | — | move with logx → platform/logging |

## memory — Domain owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| memory/agent_reader_pi_test.go | 92 | unit | Pi session reader: latest readable session, workspace filter | memory (keep) | yes | — | keep |
| memory/agent_reader_test.go | 319 | use case | opencode/claude transcript reads, day bounds, summarize-job detection | memory (keep) | yes | — | keep |
| memory/db_test.go | 581 | use case | Memory db upsert/search/FTS, reconcile, read-only open | memory (keep) | yes | partial overlap with reconcile_test.go | split >500 in Phase 20 |
| memory/persona_test.go | 502 | use case | Persona parse/merge/trim, combined-transcript building, yishan-content strip | memory (keep) | yes | — | split >500 in Phase 20 |
| memory/reconcile_test.go | 196 | use case | File classification, context-root resolution, fingerprint | memory (keep) | yes | partial overlap with db_test.go | keep |
| memory/service_test.go | 339 | use case | Summarizer/persona batch gates, config updates, log routing | memory (keep) | yes | — | keep |
| memory/summarizer_session_test.go | 135 | use case | Summarize session: reader failure, pi default, worktree gone | memory (keep) | yes | — | keep |
| memory/summarizer_test.go | 443 | use case | Memory section parse/build, merge/dedupe, budget trim, overflow rewrite, search | memory (keep) | yes | — | keep |

## node — Application boundary (Phase 18: split into vertical services)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| node/cli_tool_install_test.go | 35 | use case | CLI tool install/uninstall unknown-tool rejection | node/agent (customization) | yes | — | move with customize service (Phase 18 step 5) |
| node/dispatch_computer_test.go | 188 | use case | Computer dispatch: permissions, capture, list, map error metadata | node/system | yes | — | rename off `dispatch_`; move with system service (step 2); TestMapRPCErrorIncludesComputerMetadata → rpc |
| node/dispatch_customize_test.go | 203 | use case | Customize dispatch: extensions/agents list/install/remove/restore + validation | node/agent (customization) | yes | — | rename → customize_test.go; move with agent service (step 5) |
| node/dispatch_file_test.go | 49 | use case | file.search dispatch wiring | rpc (routing) | yes | file behavior covered by files/file_search_test.go | move with file app ops (step 3); routing → rpc |
| node/dispatch_project_list_preferences_test.go | 154 | use case | Project list preferences get/set/prune via handler | node/project | yes | store behavior covered by db/project_list_preferences_test.go | rename; move with project service (step 1) |
| node/dispatch_project_test.go | 113 | use case | Remote project list with local status overlay | node/project | yes | — | rename; move with project service (step 1) |
| node/dispatch_skill_test.go | 119 | use case | Skill dispatch: add/update/remove/list + official rules | node/agent (skill) | yes | skill behavior covered by agent/setup/skill_* | rename → skill_test.go; move with agent service (step 5) |
| node/dispatch_test.go | 26 | contract | Namespace routing through service dispatch | rpc | yes | covered by rpc/router_test.go | merge into rpc/router_test.go (Phase 18) |
| node/dispatch_workspace_close_test.go | 73 | use case | Close local marks remote closing; revert on teardown failure | node/workspace | yes | overlaps workspace_close_behavior_test.go | rename; move with workspace service (step 6); reconcile overlap |
| node/dispatch_workspace_folder_test.go | 321 | use case | Folder workspace create/list/delete + duplicate/path rules | node/workspace | yes | — | rename → folder_test.go; move with workspace service (step 6) |
| node/dispatch_workspace_project_test.go | 58 | use case | openProjectWorkspace watcher registration on skip path | node/workspace | yes | — | rename; move with workspace service (step 6) |
| node/dispatch_workspace_test.go | 597 | use case | Workspace create/open/close/health via handler; persist + snapshot publish | node/workspace | yes | overlaps create/close/hydrate behavior suites | split >500; rename; move with workspace service (step 6); reconcile overlap |
| node/handler_test_helpers_test.go | 201 | support | node service test harness (newTestHandler, callRPCForTest) | node test support → per-service test_support_test.go after Phase 18 | yes | — | split into per-service support during Phase 18 moves |
| node/hook_ingress_test.go | 380 | use case | Agent hook ingress → notification/terminal events | node/hook | yes | — | move to node/hook (Phase 20 task 4; or with step 5) |
| node/pi_provider_auth_test.go | 144 | use case | Pi provider auth dispatch: round-trip, corrupt file, nil store | node/agent (auth) | yes | — | rename; move with agent service (step 5) |
| node/pi_sessions_test.go | 950 | use case | Pi session list/get-file/start/attach/exit lifecycle + env | node/agent (session) | yes | task-run start overlap with workspace_create_taskrun_test.go | split >500; rename off `Handle`; move with agent service (step 5) |
| node/restore_test.go | 200 | use case | Memory summarizer agent runner: env, failure detail, stderr capture | node/system (scheduled job) | yes | — | move with system service (step 2) |
| node/store_contract_test.go | 371 | contract | Workspace store hydrate/open/close contract via service | node/workspace | yes | overlaps workspace_hydration_health_behavior_test.go | rename off `Manager`; move with workspace service (step 6); reconcile overlap |
| node/workspace_close_behavior_test.go | 135 | use case | Close local/remote record sequence | node/workspace | yes | overlaps dispatch_workspace_close_test.go | move with workspace service (step 6); reconcile overlap |
| node/workspace_create_behavior_test.go | 476 | use case | Create event sequence, rollback on step failure, cloud-unavailable completion | node/workspace | yes | overlaps dispatch_workspace_test.go | move with workspace service (step 6); reconcile overlap |
| node/workspace_create_flow_test.go | 48 | use case | Create rejects invalid task-run before publishing start | node/workspace | yes | — | move with workspace service (step 6) |
| node/workspace_create_relay_test.go | 109 | use case | Create snapshot republish for source node / loopback suppression | node/workspace | yes | — | move with workspace service (step 6) |
| node/workspace_create_taskrun_test.go | 265 | use case | Task-run terminal metadata, desktop-UI detection, PiStart task-run fail-closed | node/agent (taskrun) | yes | PiStart overlap with pi_sessions_test.go | move with agent service (step 5) |
| node/workspace_hydration_health_behavior_test.go | 195 | use case | Hydrate-from-DB transitions, health recovery re-registers watcher | node/workspace | yes | overlaps store_contract_test.go | move with workspace service (step 6); reconcile overlap |
| node/workspace_lifecycle_helpers_test.go | 380 | support | Workspace lifecycle test helpers (no test functions) | node/workspace test support | yes | — | rename → test_support_test.go; move with workspace service (step 6) |
| node/workspace_relay_dispatch_test.go | 89 | use case | Relay dispatch request send accepted/rejected by target state | node/workspace (relay) | yes | — | move with workspace service (step 6) |

## output — CLI output (→ cmd/output in Phase 19; exit-code policy owner from Phase 17B)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| output/print_test.go | 66 | unit | Render-data JSON output, format set validation | cmd/output | yes | — | keep; add CodeToExitCode unit test in 17B |

## rpc — Transport owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| rpc/router_test.go | 163 | contract | Namespace/bare routing, parse/version errors, notification, error mapping, binary frames | rpc (keep) | yes | — | keep; extend with handler_validation_test.go in Phase 18 |

## runtime — Platform/edge (Phase 19: cloud session → adapter/cloud/session, shellenv → platform/shellenv)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| runtime/auth_state_test.go | 235 | use case | Auth-state clear/refresh concurrency, stale-client restore prevention | adapter/cloud/session | yes | overlaps api/client_test.go (refresh paths) | move with runtime cloud session |
| runtime/client_test.go | 494 | use case | Token persistence, refresh, auth-status, service-token detection | adapter/cloud/session | yes | — | move with runtime cloud session |
| runtime/shellenv/shellenv_test.go | 107 | unit | Env path normalize/merge, executable resolution with tilde | platform/shellenv | yes | — | move with runtime/shellenv |
| runtime/user_id_test.go | 134 | unit | Token user-id persist/keep/clear | adapter/cloud/session | yes | — | move with runtime cloud session |

## terminal — Capability owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| terminal/manager_test.go | 595 | use case | Session send/read/stop, output buffer bound, lifecycle events, env resolution | terminal (keep) | yes | — | split >500 in Phase 20 |
| terminal/ports_test.go | 103 | unit | ANSI strip, port-mention detection | terminal (keep) | yes | — | keep |
| terminal/ports_unix_test.go | 36 | unit | lsof port parsing, process parsing (unix build tag) | terminal (keep) | yes | — | keep |

## tokenusage — Domain owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| tokenusage/attribution/attribution_test.go | 72 | unit | Worktree resolution, registry enrichment | tokenusage/attribution (keep) | yes | — | keep |
| tokenusage/collection/collector_test.go | 168 | use case | Scan-window resolution, recovery scan, idempotent row replacement | tokenusage/collection (keep) | yes | — | keep |
| tokenusage/pricing/model_pricing_test.go | 217 | use case | Pricing candidates/aliases, cost estimate, catalog cache/refresh | tokenusage/pricing (keep) | yes | — | keep |
| tokenusage/repository/repository_test.go | 45 | unit | Hourly row conversion round-trip | tokenusage/repository (keep) | yes | — | keep |
| tokenusage/scanner/scanner_claude_codex_live_test.go | 184 | live | Live transcript fixture scan counts | tokenusage/scanner (keep) | yes | — | keep |
| tokenusage/scanner/scanner_claude_test.go | 220 | unit | Claude transcript parse, hourly integration, turn/tool counts | tokenusage/scanner (keep) | yes | — | keep |
| tokenusage/scanner/scanner_codex_test.go | 304 | unit | Codex line parse, session scan, hourly integration | tokenusage/scanner (keep) | yes | — | keep |
| tokenusage/scanner/scanner_opencode_live_test.go | 267 | live | Live DB scan for skill manager + current workspace | tokenusage/scanner (keep) | yes | — | keep |
| tokenusage/scanner/scanner_opencode_test.go | 446 | unit | OpenCode message buckets, model normalize, direct cost, turns/tools | tokenusage/scanner (keep) | yes | — | keep |
| tokenusage/scanner/scanner_pi_test.go | 294 | unit | Pi activity parse, direct-cost preference, session-root resolution | tokenusage/scanner (keep) | yes | — | keep |

## workspace — Domain owner

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| workspace/application/create_engine_test.go | 233 | unit | Create path resolution, progress state activation | workspace/application (keep) | yes | — | keep |
| workspace/application/prepare_test.go | 223 | use case | Prepare validation, task-run kind default, relay request, registration fallback | workspace/application (keep) | yes | — | keep |
| workspace/hooks_test.go | 373 | use case | Hook execution, env injection, timeout, shell resolution, common-path dirs | workspace (keep) | yes | — | keep |
| workspace/instance/handle_test.go | 53 | unit | Instance handle file ops scoped to path | workspace/instance (keep) | yes | — | keep |
| workspace/instance/state_test.go | 50 | unit | State transition validity | workspace/instance (keep) | yes | — | keep |
| workspace/pr/tracker_test.go | 310 | use case | PR tracker bind/stop/clear, provider/remote gates, typed updates | workspace/pr (keep) | yes | — | keep |
| workspace/watchers/emit_test.go | 151 | unit | Changed-path batching/overflow, emit scheduling | workspace/watchers (keep) | yes | — | keep |
| workspace/watchers/state_test.go | 57 | unit | Changed-path handling for missing/non-dir worktrees | workspace/watchers (keep) | yes | — | keep |
| workspace/watchers/watchers_test.go | 683 | use case | Git-dir resolution, change detection, ignore rules, shared context watchers | workspace/watchers (keep) | yes | — | split >500 in Phase 20 |
| workspace/workspace_context_test.go | 720 | use case | Context-link ensure/remove/sync, git-exclude rules, non-git folder rules | workspace (keep) | yes | — | split >500 in Phase 20 |

## worktree — Single-owner (→ workspace/worktree in Phase 19)

| Test file | Lines | Type | Behavior | Target owner | Private | Duplicate | Action |
|---|---|---|---|---|---|---|---|
| worktree/create_test.go | 86 | unit | Ref resolution, local-branch collision | workspace/worktree | yes | — | move with worktree → workspace/worktree |

## Summary

- Total test files: 124. No same-stem production file: 38 (kept when behavior has a clear owner).
- Files >500 lines (11): files/file_service_test (954), node/pi_sessions_test (950),
  git/git_service_test (917), workspace/workspace_context_test (720),
  workspace/watchers/watchers_test (683), agent/setup/pi_extensions_test (676),
  node/dispatch_workspace_test (597), terminal/manager_test (595),
  memory/db_test (581), agent/setup/pi_agents_test (564), memory/persona_test (502).
  All split in Phase 20 by behavior.
- `dispatch_*` node files (11): all renamed to their behavior/namespace names when
  their service moves in Phase 18.
- Node → vertical services: workspace 11 files, agent 6, project 2, system 2,
  hook 1, rpc 2 (routing merges), support 2 (renamed).
- Duplicate/overlap clusters to reconcile during Phase 18 moves:
  workspace create/close/hydrate/health (5 files), pi session start (2 files).
