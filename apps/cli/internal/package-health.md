# CLI Package Health Baseline (Phase 24)

Phase 24 deliverable of the CLI package-health plan (`cli4.md`, phases 24–30,
kept in the project context under `architecture/refactor/`).
Measured on `cli-refactor-6` (base `15bf5319`, 2026-08-16) before any behavior
moves. This document is the baseline for Phases 25–29: it records owners,
test maps, and intended file moves. No production behavior changed in Phase 24.

## Owner statements (package comments)

| Package | Owner statement |
|---|---|
| `internal/tokenusage/collection` | Owns the token-usage collection pipeline: schedule agent-transcript scans, sync dirty hourly rows to the cloud API, backfill historical cost. `Collector` is the single lifecycle owner of every timer and background loop. |
| `internal/agent/setup` | Owns agent installation, extension setup, and skill discovery for the Yishan-managed pi environment; the single owner of these policies. |
| `internal/adapter/cloud` | Owns access to the Yishan cloud HTTP API: `Client` handles transport/token refresh/decoding, resource files hold endpoint methods, mapper files convert DTOs to domain records. |
| `internal/memory` | Owns the local memory store and summarization workflows: SQLite file index, session summarization, daily persona batch, index reconciliation. `Service` is the application facade. |
| `internal/workspace/pr` | Owns continuous pull-request observation for tracked workspaces: poll loop and refresh coordination only. |

## Background processes and their lifecycle owners

| Process | Package / owner | Start | Stop |
|---|---|---|---|
| Collector startup scan timer (30 s) | collection.Collector | `StartStartupScan` | `Close` |
| Per-agent debounce timers (45 s) | collection.Collector | `Trigger` | `Close` |
| Periodic sync loop (15 min) | collection.Collector | `startSyncLoop` (via `StartStartupScan`) | `Close` |
| Hour rollover loop (top of hour + 2 min) | collection.Collector | `startHourRolloverLoop` | `Close` |
| Pricing catalog async refresh | collection.Collector | `StartStartupScan` / `onPeriodicSync` | `Close` (via catalog owner) |
| PR poll loop (5 min) | pr.Tracker | `EnsureTracked` (first tracked workspace) | `Stop` |
| PR refresh goroutines (per workspace) | pr.Tracker | `RefreshWorkspaceByPath` / `pollLoop` | `Stop` + `endRefresh` |
| PR persistence goroutines | pr.Tracker | `setWorkspacePullRequest` | fire-and-forget, composition root hooks |
| Memory summary queue (per context root) | memory.Service | `SummarizeSession` → `summarizeQueue.submit` | drains; no explicit stop (daemon exit) |
| Daily persona batch goroutine | memory.Service (personaService) | `MaybeRunDailyPersonaBatch` → `runBatch` | fire-and-forget (daemon exit) |
| Extension update check goroutines (HTTP) | agent/setup | `CheckPiExtensionUpdates` | `wg.Wait()` before return |

## Mutable resources and their owners

| Resource | Owner |
|---|---|
| `Collector.timers / inFlight / needsRerun / recoverySinceByAgent / pending` (under `mu`) | collection.Collector |
| `Tracker.active / inFlight` (under `mu`) | pr.Tracker |
| `Service.summarizeQ` (`sync.Map` of per-root queues) | memory.Service |
| `personaService.lastExtractionDate` (under `mu`) | memory.Service.persona |
| `extensionUpdateCache` (package-level, `sync.Mutex`) | agent/setup (pi_extensions.go) |
| `cloud.Client` token fields + refresh callbacks | adapter/cloud.Client |
| `setup` package-level template vars (`zshenvTemplate`, `notifyShellScript`, ...) | agent/setup (initialized once, read-only after) |

## Files over 300 lines (target packages, 2026-08-16)

| File | Lines | Cohesive? |
|---|---:|---|
| `tokenusage/collection/collector.go` | 563 | No — lifecycle + scan + sync + backfill + debug (Phase 25 split) |
| `agent/setup/pi_agents.go` | 479 | Partial — agent file I/O + frontmatter parsing + policy (Phase 26) |
| `agent/setup/pi_extensions.go` | 454 | Partial — install + registry + parsing + metadata (Phase 26) |
| `agent/setup/skill_discovery.go` | 397 | Partial — dir scanning + trust + source precedence (Phase 26) |
| `adapter/cloud/methods.go` | 470 | No — all endpoint families in one bucket (Phase 27 split) |
| `memory/service.go` | 383 | Partial — facade + queue lifecycle + persona orchestration (Phase 28) |
| `memory/summarizer.go` | 345 | Yes — session summarization pipeline |
| `memory/agent_reader.go` | 341 | Yes — opencode/claude transcript readers |
| `memory/persona.go` | 320 | Partial — persona summarizer + CLI db reader |
| `workspace/pr/tracker.go` | 435 | No — polling + git queries + comparison + persistence + events (Phase 29) |

## Exported symbols and production importers

Count = production (non-test) files outside the owning package that both import
the package and use the symbol (word-boundary match), checked 2026-08-16.

### `tokenusage/collection` (3 exported)

| Symbol | Importers |
|---|---|
| `Collector` | facade `tokenusage` package (via `NewCollector` return) |
| `NewCollector` | `internal/tokenusage/tokenusage.go` |
| `DebugState` | `internal/tokenusage/tokenusage.go` |

### `workspace/pr` (4 exported)

| Symbol | Importers |
|---|---|
| `New` | `internal/app/app.go` |
| `Tracker` | `internal/app/app.go`, `internal/node/workspace/service.go` |
| `TrackerDeps` | `internal/app/app.go` |
| `PullRequestUpdatedEvent` | `internal/app/app.go`, `internal/node/workspace/watchers.go` |

### `memory` (21 exported)

| Symbol | Importers |
|---|---|
| `Service` | app (app.go, memory.go), node/hook/ingress, node/system (memory.go, service.go), node/workspace/service |
| `DB` | cmd/memory, app, node/workspace |
| `SummarizerConfig` | cmd/persona, app (app.go, memory.go), daemon/process |
| `WorkspaceRef` | cmd/memory, node/system |
| `RunAgentFunc` | node/system/restore |
| `MemorySearchResult` | cmd/memory |
| `ErrAgentNotFound` | node/system/restore |
| `SearchInput` | cmd/memory |
| `PersonaFilePath` | cmd/persona, agent/setup/skill_setup |
| `BuildEmptyPersonaMarkdown` | cmd/persona, agent/setup/skill_setup |
| `NewAgentDBReaderForCLI` | cmd/persona |
| `NewPersonaSummarizer` | cmd/persona |
| `GlobalMemoryDir` | cmd/memory |
| `OpenDB` | app/memory, cmd/memory |
| `OpenReadOnly` | app/memory, cmd/memory |
| `MaxProjectMemoryChars` | 0 (documented contract; used by summarizer budget tests) |
| `FileTypeMemory` | 0 (internal vocabulary; exported const kept for cmd consumers — see note) |
| `SectionLockedDecisions` | 0 (internal vocabulary, tests) |
| `PersonaSectionCodeStyle` | 0 (internal vocabulary, tests) |
| `NewService` | app (app.go, memory.go), node/system/service, node/workspace/service |

Note: `MaxProjectMemoryChars`, `FileTypeMemory`, `SectionLockedDecisions`,
`PersonaSectionCodeStyle` have no production importer outside `memory`. They are
exported because cmd/memory prints budget info and persona section constants
document the MEMORY.md format. Candidate for Phase 30 review (privatize or
document); no action in Phase 24.

### `adapter/cloud` (48 exported)

Production importers: cmd/auth, cmd/auth_token_sync, cmd/job, cmd/login,
cmd/org, cmd/workspace, cmd/root, daemon/remote_sync,
tokenusage/collection/collector.go, node/workspace (services_application,
remote), node/project/service, node/system (system, scheduler), plus
`Client`/`NewClient`/`NewRuntimeClient` in cmd/root and node services.

Symbols with no direct production importer (used only inside the package or by
tests — response payload types and input builders): `AddOrganizationMemberResponse`,
`CreateNodeResponse`, `CreateOrganizationResponse`, `CreateProjectResponse`,
`CreateServiceTokenResponse`, `CreateWorkspaceResponse`, `CreateWorkspaceInput`,
`HealthResponse`, `ListProjectsWithWorkspacesResponse`, `ListServiceTokensResponse`,
`ListTokenUsageHourlyInput`, `MeResponse`, `OKResponse`, `OrganizationMember`,
`ProjectWithWorkspaces`, `RefreshTokenResponse`, `RegisterNodeResponse`,
`RelayTokenResponse`, `ScheduledJob`, `ServiceToken`, `TokenUsageHourlyRowOutput`,
`UpdateNodeScopeResponse`, `UpdateWorkspaceInput`, `UpsertWorkspacePullRequestInput`,
`CreateProjectInput`. These are wire contract types; Phase 27 keeps them next to
their resource files. Candidate for Phase 30 review.

### `agent/setup` (49 exported)

Production importers: cmd/setup.go, daemon/process_server.go, node/agent/skill.go,
node/agent/customize.go.

| Symbol | Importers |
|---|---|
| `EnsureDefaultPiExtensionSetup` | cmd/setup |
| `EnsurePersonaSetup` | cmd/setup |
| `RemoveManagedAgentRuntime` | cmd/setup |
| `GetInstalledState` | cmd/setup |
| `InstalledState`, `ExtensionState`, `HookState`, `MCPState` | cmd/setup |
| `EnsureManagedAgentRuntime` | cmd/setup, daemon/process_server |
| `RemoteHostPolicyEnvKey` | daemon/process_server |
| `ListPiExtensions` | node/agent/customize |
| `InstallPiExtension` / `RemovePiExtension` / `UpdatePiExtension` / `CheckPiExtensionUpdates` | node/agent/customize |
| `ListPiAgents` / `GetPiAgentDetail` / `CreatePiAgent` / `UpdatePiAgent` / `RemovePiAgent` / `RestorePiAgent` | node/agent/customize |
| `ErrInvalidAgentName` | node/agent/customize |
| `ListSkills` / `GetSkillInfo` / `GetSkillDetail` / `AddSkill` / `RemoveSkill` / `UpdateSkill` / `UpdateAllSkills` | node/agent/skill |
| `ErrInvalidSkillName` | node/agent/skill |

No production importer (candidates for Phase 30 review; no action in Phase 24):
`DefaultPiExtensionNames`, `EnsureDefaultPiExtensions`, `RemoveDefaultPiExtensions`,
`RemoveDefaultPiExtensionSetup`, `NotifyScriptPathEnvKey`, `PiExtensionSourceLocalFile`,
`AssetState`, `ShellState`, `PiAgentInfo`, `PiAgentDetail`, `PiExtensionInfo`,
`SkillInfo`, `SkillDetail`, `DiscoveredSkill`, `SkillSourceKind`, `SkillSourceProject`,
`EnumeratePiSkills`, `ValidateAgentThinking`.

## Production behavior → test file map

### `tokenusage/collection`

| Behavior | Test file |
|---|---|
| Scan-window resolution (bootstrap, last-successful-sync overlap, recovery window) | `collector_test.go` (TestRecentScanStartUnixMilli*, TestResolveScanStartUnixMilli*, TestRequestRecoveryScan*) |
| Idempotent row replacement (runScan twice) | `collector_test.go` (TestRunScanReplacesRowsIdempotently) |
| **Gap:** shutdown, concurrent triggers, retry/rerun, partial sync errors, timer loop behavior | none |

### `workspace/pr`

| Behavior | Test file |
|---|---|
| Bind/stop/clear PR, typed update publication | `tracker_test.go` |
| Overlapping refresh skip | `tracker_test.go` (TestWorkspacePRTracker_SkipsOverlappingRefreshes) |
| Provider/remote eligibility gates | `tracker_test.go` + `eligibility.go` (via tracker tests) |
| **Gap:** `Stop()` shutdown, comparison helpers unit-level (checks/deployments equality), persistence conversion | none direct |

### `memory`

| Behavior | Test file |
|---|---|
| Session summarization (reader failure, pi default, worktree gone) | `summarizer_session_test.go` |
| Memory section parse/build, merge/dedupe, budget trim, overflow, search scope | `summarizer_test.go` |
| Persona parse/build/merge/trim, transcript building, yishan-content strip | `persona_test.go` (merge/parse/transcript/trim split files) |
| Agent transcript readers (opencode/claude date-range, summarize-job detection, pi reader) | `agent_reader_test.go`, `agent_reader_pi_test.go` |
| Service facade: result logging, batch date gate, config updates, should-index | `service_test.go` |
| DB store: upsert/get/delete/list, FTS search, read-only | `db_test.go`, `search_test.go`, `readonly_test.go` |
| Reconciliation: file classify, context root, fingerprint, index-on-disk | `reconcile_test.go` |
| **Gap:** summary-queue serialization/shutdown, partial persona-batch errors, persona summarizer direct tests | none direct |

### `agent/setup`

| Behavior | Test file |
|---|---|
| Pi agent create/update/remove/restore + frontmatter | `create_test.go`, `lifecycle_test.go` |
| Managed agent sync (preserve user edits, manifest, stale removal) | `sync_test.go`, `pi_agent_setup_test.go` |
| Pi extension list/classify/update-check | `list_test.go`, `updates_test.go` |
| Extension install/remove via pi command + managed env | `install_test.go`, `hook_setup_test.go` (default ext setup) |
| Skill discovery: dir scan, source precedence, trust | `skill_discovery_test.go` |
| Skill CLI install/remove/sanitized names | `skill_cli_test.go` |
| Skill list/get/detail + frontmatter | `skill_service_test.go` |
| Hook assets, shell setup, managed runtime | `hook_setup_test.go`, `lifecycle_test.go` |
| **Gap:** skill-source scan (package skills, settings skills), shell template rendering direct tests, `RemoveManagedAgentRuntime` coverage | none direct |

### `adapter/cloud`

| Behavior | Test file |
|---|---|
| HTTP raw/refresh flow, failure classification, proactive refresh | `client_test.go` |
| Workspace create/update/close payload shaping + sourceNodeId | `methods_test.go` |
| JWT user-id parsing | `token_test.go` |
| Input builders (create/update/close) | `workspace_inputs_test.go` |
| Workspace DTO → domain conversion | `workspace_mapper_test.go` |
| Expiry parsing | `expiry.go` (covered via client_test refresh paths) |
| **Gap:** every other endpoint method (orgs, nodes, projects, workspaces list, usage, jobs, tokens, PR, relay) has no direct method test | none |

## Orphan tests

- `memory/persona_test.go` is an empty 3-line file (stub) — behavior tests live
  in `merge_test.go`, `parse_test.go`, `transcript_test.go`, `trim_test.go`.
  Remove or fold into a real file in Phase 28.
- `agent/setup/pi_agents_test.go` (25 lines) and `pi_extensions_test.go` (64
  lines) contain only helpers (`writeAgentFile`, `extensionsByName`, ...), no
  `Test*` functions. Helpers are consumed by `create_test.go` / `list_test.go`
  / `updates_test.go`; consider moving to `test_support_test.go` in Phase 26.

## Target file map before code moves

### Phase 25 — `tokenusage/collection`

```text
collector.go          # lifecycle and orchestration only (stays ~<300)
scan.go               # source scan coordination (runScan, scanAgent*, window resolution, beginScan/finishScan)
sync.go               # dirty-row cloud sync (syncPending, snapshotDirtyRowsByOrg, syncRowsForOrg)
backfill.go           # historical cost backfill (maybeBackfillHistoricalCost, reconstructedUncachedInputTokens)
schedule.go           # timers and trigger behavior (Trigger, startSyncLoop, startHourRolloverLoop, on*)
debug.go              # DebugState construction
recovery.go           # recovery policy (was collector_recovery.go; RequestRecentRecoveryScan, requestRecoveryScan)
collector_test.go     # lifecycle/orchestration tests (shutdown, concurrent, retry)
scan_test.go, sync_test.go, backfill_test.go, schedule_test.go, debug_test.go
```

Scanner registration (done with Phase 25): `scanner.Scanner` interface +
`scanner.Registry` (Register/Scanner/Kinds/DefaultRegistry) added; the
collector dispatches through the registry instead of a hardcoded switch, so
new providers register in `scanner.DefaultRegistry()` rather than editing
collection code.

### Phase 26 — `agent/setup` (resource files, same package)

Stayed one package: dense cross-coupling (shared YAML scalar helpers, pi
command execution, settings loader, skill dir scanning) means subpackages
would force exporting internals and grow the parent API. File-level owners
instead (Phase 26 done):

```text
agents.go               # pi agent operations (List/Get/Create/Update/Remove/Restore, errors, types)
agents_io.go            # agent file I/O + path rules (piAgentPath, read/write, validateAgentPathName)
agents_frontmatter.go   # agent frontmatter parse/format (no policy)
agents_policy.go        # official-agent policy (managed names, name pattern, thinking levels)
agents_managed.go       # managed agent sync + manifest (was pi_agent_setup.go)
extensions.go           # extension ops (List/Install/Remove/Update) + default-set install
extensions_source.go   # source-spec parsing (packageEntrySource, extensionNameFromSource, git parts)
extensions_registry.go  # npm registry version lookup + TTL cache (no fs mutation)
extensions_metadata.go  # installed package.json/README reads (no mutation)
pi_command.go           # managed pi/npx command execution + env (was pi_runtime.go)
frontmatter.go          # shared YAML scalar helpers (block scalars, quoted values, escapes)
skill_discovery.go      # discovery entry + dir scanning + trust (keep)
skill_source_scan.go    # package + settings skill sources (keep)
skill_cli.go            # skill install/remove/update via CLI (keep)
skill_service.go        # skill list/get/detail (keep; scalar helpers moved to frontmatter.go)
state.go / hook_setup.go / hook_assets.go / shell_setup.go / provider.go / skill_setup.go / doc.go  # keep
```

Test support: helper-only pi_agents_test.go + pi_extensions_test.go merged
into test_support_test.go; pi_agent_setup_test.go renamed agents_managed_test.go.

### Phase 27 — `adapter/cloud`

```text
client.go             # shared HTTP mechanics + client-level endpoints (keep; DoRaw/DoDecode/refresh, Health/WhoAmI/RefreshToken/RevokeToken, shared DTOs OKResponse/HealthResponse/MeResponse/User/RefreshTokenResponse/TokenUpdate)
organizations.go      # org methods + org DTOs
nodes.go              # node methods + node DTOs (incl. RelayToken)
projects.go           # project methods + project DTOs
workspaces.go         # workspace methods + workspace DTOs + input builders (was workspace_inputs.go)
pull_requests.go      # UpsertWorkspacePullRequest + input
usage.go              # List/UpsertTokenUsageHourly + row types
jobs.go               # scheduled job run methods + inputs + job DTO
service_tokens.go     # service token methods + inputs
workspace_mapper.go / workspace_inputs.go→workspaces.go / token.go / expiry.go / runtime_client.go  # keep
methods.go            # deleted (phase done)
types.go              # deleted; resource DTOs moved to their resource files
methods_test.go       # → workspaces_test.go (payload shaping + input builders merged)
```

### Phase 28 — `internal/memory`

```text
service.go            # facade only (application operations, config, entry points)
queue.go              # summarizeQueue lifecycle (submit/run loop/drain; new)
summarizer.go         # session summarization pipeline + its types (extractedKnowledge, memorySection, summarizeResult, summarizeSessionError, sessionReader, builtInSummarizerAgentKind)
persona.go            # persona batch orchestration (personaService: maybeRunBatch/runBatch) + CLI helpers (personaFilePath, NewAgentDBReaderForCLI, BuildEmptyPersonaMarkdown) + sessionDateReader interface
persona_summarizer.go # personaSummarizer + SummarizeForPersona + buildCombinedTranscript + stripYishanInjectedContent + prompt (new)
persona_sections.go   # persona section parse/build/merge/trim + personaSection/extractedPersona/personaSections types + MaxPersonaChars
agent_reader*.go      # transcript readers + sessionMessages/sessionMessage types
reconcile.go          # file classification/scan + WorkspaceRef type
search.go             # SearchInput + SearchMemory + MemorySearchResult type
budget.go             # budget trim + MaxProjectMemoryChars/MaxGlobalMemoryChars
service.go            # (see above)
queue_test.go         # serialization/coalescing/drain/restart tests (new)
persona_batch_test.go # batch read/extraction/agent-not-found/happy-path tests (new)
persona_test.go       # empty stub → removed
```

### Phase 29 — `internal/workspace/pr`

```text
tracker.go            # polling lifecycle + refresh coordination only
compare.go            # prMeaningfullyChanged, checksEqual, deploymentsEqual (pure)
resolve.go            # refreshWorkspace query flow against consumer-owned interface
persist.go            # persistence hooks (persistPullRequest/resolvePullRequest) → storage adapter
events.go             # event publication (PullRequestUpdatedEvent)
eligibility.go        # provider/remote gates (keep)
tracker_test.go       # split: poll, compare, error tests
```

## Validation

Phase 24 changed no production behavior: only package comments and this
document. `go build ./...`, `go vet ./...`, `go test ./...` in `apps/cli`
must pass at the end of the phase (checked at phase close).
