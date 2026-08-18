# Desktop Renderer Architecture

This document defines the stable ownership model for the Electron Renderer
(`apps/desktop/src/renderer`). It is the contract enforced by
`src/renderer/architecture.test.ts` and the mandatory reading for any change
in the Renderer.

The Electron main process (`src/main`) is outside this document. Change it only
when a Renderer boundary requires a host contract change.

Use `refactor/desktop7.md` for the current Domain normalization order and
completion criteria. Use
`refactor/desktop-ownership-first-normalization.md` for ownership selection.

## Top-Level Owners

| Path | Owner | Examples |
|---|---|---|
| `app/` | Renderer composition root | `RendererApplication.tsx`, `routes/`, `commands/`, `events/`, `runtime/`, `selectors.ts` |
| `domains/` | Product behavior, split by Domain | `workspace/`, `agent/`, `settings/`, `terminal/`, `workbench/`, … |
| `api/`, `rpc/` | Infrastructure (transport) | REST clients, daemon JSON-RPC clients, DTO types |
| `hooks/` | Domain-free React behavior | request guards, refresh behavior, context-menu behavior |
| `ui/` | Domain-free stateless presentation | primitive controls, layout, generic visual feedback |
| `helpers/` | Migration bucket, being retired | Each file moves to its Feature, Domain, App, or a named global owner. |

The Renderer has 15 Domains: `agent`, `browser`, `files`, `git`, `node`,
`notification`, `organization`, `overview`, `project`, `scheduled-job`,
`session`, `settings`, `terminal`, `workbench`, `workspace`.

## Domain Layers

Each Domain may contain these layers. A layer is a directory, not a class.

| Layer | Owns | Can import | Must not import |
|---|---|---|---|
| `features/<use-case>/` | One use case or smart UI grouping | own UI, Hooks, Commands, Selectors, Model, another Domain's public API | raw transport, Infrastructure implementations, Runtime implementations, another Domain's internals |
| `ui/` | Stateless presentation shared by multiple Features | React, own Model types, root UI | State, Hooks, Commands, Runtime, Infrastructure, transport |
| `hooks/` | React behavior shared by multiple Features | own Model, State, Selectors, Commands, Runtime entry points | direct transport, persistence, long-lived resource ownership, cross-Domain transactions |
| `model/` | Stable Domain concepts, value objects, invariants, and pure rules | own Model | React, Zustand, transport, persistence, Runtime, State implementations |
| `state/` | Domain-shared State, Stores, Selectors, and synchronous mutations | own Model, own State, Zustand | React, Hooks, Commands, Runtime, Infrastructure, transport |
| `commands/` | Domain application actions and use cases | own Model, State, Services, Domain ports, other Domain public APIs | Features, UI, Hooks, transport implementations |
| `services/` | Stateless operations across Domain Model concepts | own Model | React, State, Commands, Runtime, Infrastructure, transport |
| `runtime/` | Timers, subscriptions, registries, queues, processes, and external instances | own Model, State actions, Runtime ports | Features, UI, Hooks, raw transport outside an adapter |
| `events/` | Domain handlers for events that already occurred | own Commands, State actions, other Domain public APIs | another Domain's State, Runtime, Events, or Infrastructure |
| `infrastructure/` | API, RPC, IPC, daemon, filesystem, persistence, and DTO mapping | own Model and port contracts, root transport clients, host contracts | Features, UI, Hooks, another Domain's internals |

Feature-local UI, Hooks, State, helpers, and tests stay inside their Feature.
Do not promote them because of their file type.

Domain `ui` contains only shared presentational UI. It has no State
subscriptions, Commands, React State, lifecycle behavior, or external I/O.

Domain `hooks` is parallel to `features`, `ui`, and `state`. It is not inside
`ui` or `state`.

`app/flows` is a migration source. Move cross-Domain orchestration to
`app/commands`, and move Domain rules to their owning Domain. Do not add a
new `flows` directory.

## Domain Public API

A Domain's `index.ts` is its public API. Use explicit named exports. Do not
use `export *` in this file. It can export:

- Command contract types.
- Command entry functions when composition requires them.
- Domain Models.
- State Selectors (read models).
- Read-only hooks with a stable contract.
- Stable UI entry points.

A Domain must not export:

- A Store instance for another Domain to mutate.
- A Runtime implementation.
- An Event Handler implementation.
- Internal State mutations with business meaning.
- Transport DTOs as domain Models.

The public State surface (`*Selectors.ts`, `*Actions.ts`) and Model types are
importable across Domains, but the Domains plan (D2) requires cross-Domain
imports to go through the Domain's public `index.ts`. Prefer exporting these
items from `index.ts` over deep-importing them.

## Route and Page Ownership

`app/routes/` owns the route table and page composition (`AppRoutes.tsx`).
Route pages compose Domain UI entry points. They may import Domain public
APIs but not Domain internals.

## Store and Selector Placement

- Each Domain owns its Zustand stores in `domains/<domain>/state/`.
- A Selector reads its own Domain's State only.
- Cross-Domain reads use the other Domain's public Selectors, or an
  application read model in `app/selectors.ts` when the read combines data
  from several Domains.
- Do not create a combined Store for screen data. Derive screen data from
  Domain Selectors.

## Hook Classification

- A Hook used by one Feature stays in that Feature.
- A Hook shared by multiple Features in one Domain lives in that Domain's
  `hooks/` directory.
- A domain-free Hook lives in the root `renderer/hooks/` directory.
- Hooks that own timers, subscriptions, or other runtime resources move to an
  application or Domain Runtime and receive explicit start/stop behavior.
- Pure transforms are Model functions, not hooks.

## Cross-Domain Composition

Cross-Domain workflows belong to `app/commands` or `app/events`. Application
code composes Domain public APIs; Domains never compose one another's
internals, and Domains never import `app`.

## Required Dependency Direction

```text
main
  -> app
      -> Domain public APIs
      -> infrastructure

Domain UI
  -> own Model types
  -> root UI

Domain Feature
  -> own UI
  -> own Hooks
  -> own Commands
  -> own State Selectors
  -> public APIs from other Domains

Domain Hooks
  -> own Commands
  -> own State Selectors
  -> Runtime entry points

Domain Commands
  -> own Model
  -> own State
  -> own Services
  -> Runtime and Infrastructure ports
  -> public APIs from other Domains

infrastructure
  -> Domain ports
  -> transport DTOs
  -> API, RPC, IPC, daemon, filesystem, and persistence implementations
```

## Architecture Test and Exception Policy

`src/renderer/architecture.test.ts` enforces the rules above (R1, R1b, R3–R16).
It has one focused test group per rule and fails on:

- a new boundary violation (with file and import target);
- a stale allowlist row (violation already fixed);
- an allowlist row tagged with a completed phase.

`src/renderer/architecture.knownViolations.ts` is the allowlist. Rows record
pre-existing violations that later Domain phases remove. Every row carries the
tag of the Domain phase that owns its removal (`D3`–`D17`); rows tagged with a
completed phase (`COMPLETED_PHASES`) are rejected. A phase that fixes a
violation removes its row in the same pull request.

The violation count must not increase during a phase. Record the count in each
refactor pull request.

## Domain Normalization Progress

Status values: `planned` (not started), `active` (one Domain at a time), or
`completed` (per-Domain exit criteria met). The order follows dependency
evidence: small foundation Domains first, Settings last because it currently
displays and imports behavior from many Domains.

| Phase | Domain | Status | Primary purpose |
|---|---|---|---|
| D3 | `session` | `completed` | Establish authentication, bootstrap State, and public identity reads. |
| D4 | `organization` | `completed` | Separate organization administration from Session and shared UI. |
| D5 | `node` | `completed` | Establish node discovery, selection data, and administration ownership. |
| D6 | `project` | `completed` | Establish project identity, configuration, grouping, and list behavior. |
| D7 | `workbench` | `completed` | Establish active context, tabs, panes, layout, and presentation Commands. |
| D8 | `workspace` | `completed` | Establish Workspace lifecycle, creation, health, and Workspace-specific UI. |
| D9 | `files` | `completed` | Establish file browsing, editing, search, and editor behavior. |
| D10 | `git` | `completed` | Establish Git, diff, branch, commit, and pull-request ownership. |
| D11 | `terminal` | `completed` | Establish terminal sessions, instances, transport, focus, and recovery. |
| D12 | `agent` | `completed` | Establish Agent sessions, providers, messages, streams, and Agent UI. |
| D13 | `notification` | `completed` | Establish notification decisions, delivery, sound, and preferences. |
| D14 | `overview` | `completed` | Establish usage data, filters, charts, and overview loading. |
| D15 | `scheduled-job` | `completed` | Establish job definitions, execution controls, and run history. |
| D16 | `settings` | `completed` | Keep only the settings shell and preferences without a stronger Domain owner. |
| D17 | (Final Closure) | `superseded` | R6/R7/R9 and the app/ui split closed; the R16 App audit is deferred to desktop7 Phase 22. |

Settings (desktop7 Phase 23): owns the settings shell (navigation, search,
composition), appearance (theme/language/editor/markdown), keybindings, CLI
install, daemon preferences, and account (profile + account-scoped service
tokens). Agent, Node, Organization-member, Notification, Terminal-session, and
Workspace behavior moved to their owning Domains. Domain-free settings layout
primitives moved to root `ui/components`.

A Domain is complete when its per-Domain exit criteria pass: one-sentence
owner, explicit responsibility list, Feature-local code in use-case Features,
Domain UI only Domain-shared presentation, Model only stable concepts, external
I/O in Infrastructure, other Domains use only the public `index.ts`, no
cross-Domain deep import, no allowlist row assigned to its phase, and the
full test suite passes.

## Current Status

The Renderer ownership refactor runs under the Desktop Domains plan. Phase D1
renamed `features/` to `domains/` (mechanical, no behavior change). Phase D2
prepared Domain-by-Domain enforcement: the architecture test now enforces
cross-Domain imports through public `index.ts` (R14), forbids Domain imports
of `app` (R15), forbids App deep imports into a Domain (R16), and tags every
allowlist row with the Domain phase that removes it. The Domain phases D3–D17
normalize one Domain at a time.

Execution moved to `refactor/desktop7.md` (Phases 21–27). D6–D16 are
completed; D17's remaining App audit is desktop7 Phase 22. R14 is zero;
R16 stands at 73 and must not increase until Phase 22 removes it.

## Root Migration Baselines (desktop7 Phase 21)

Baselines recorded 2026-08-18 in `architecture.migrationBaselines.ts`; the
architecture test rejects growth: no new root Helpers file, no new production
Helpers importer, no new `ui/hooks` file, no new root UI dependency violation.

### Root Helpers (44 files: 29 production, 15 tests)

| Helper | Provisional owner |
|---|---|
| `binaryExtensions`, `diffSearch` | Files `diff-viewer` Feature |
| `excalidrawScene` | Files `file-editor` Feature |
| `editorLanguage`, `gitGutterDiff` | Files Services or Model (dependency review) |
| `monacoSetup`, `monacoThemeRules` | Files Infrastructure (Monaco) |
| `diffTheme` | Files UI or a named code-theme capability |
| `syntaxThemeComparison` | Remove (no production consumer) |
| `workspaceBranchNaming` | Workspace `create-workspace` Feature — **moved (Phase 24)** |
| `workspaceDisplayNames` | Workspace Services — **moved (Phase 24)** |
| `localFolder` | Workspace Model — **moved (Phase 24)** |
| `pullRequestUtils` | Git Model or Services |
| `leftPaneStyles` | App `project-workspace-navigator` Feature — **moved (Phase 24)** |
| `terminalTabUtils` | Workbench Model — **moved (Phase 24)** |
| `terminalCloseTombstones` | App Runtime |
| `clipboard`, `platform` | Named platform Infrastructure |
| `delay`, `withTimeout` | Named shared async capability |
| `generateId` | Named shared ID capability |
| `pathHelpers` | Named shared path capability |
| `styles` | Root UI typography capability |
| `codeThemes` | Settings theme capability |
| `version` | Shared version capability (App runtime) |
| `versionHelpers` | App launch Feature |
| `errorHelpers` | Canonical shared error module; remove the Renderer re-export facade |
| `formatters` | Split by meaning: resource-usage UI formatting vs token formatting Feature |
| `issueLinks`, `tabHelpers` | Remove after consumer search (none found) |

### Root UI (33 files: 29 components, 4 `ui/hooks`)

| Item | Provisional owner |
|---|---|
| `BranchBadge`, `PullRequestIcon` | Git UI |
| `BranchDropdown` | Workspace `create-workspace` Feature — **moved (Phase 24)** |
| `ResourceUsageMenu` | Workspace resource-usage Feature — **moved (Phase 24)** |
| `DiagramZoomOverlay` | Files UI plus Files React behavior |
| `KeybindingDisplay` | Settings keybindings Feature — **moved (Phase 23)** |
| `PortsTableMenu` | App main-workspace-shell Feature — **moved (Phase 22)** |
| `AppBootstrapLoadingView` | App launch Feature — **moved (Phase 22)** |
| `RouteCloseWatcher` | Root Hook — **moved to `renderer/hooks` (Phase 22)** |
| `CenteredSpinner`, `FloatingSurface`, `SearchInput`, `StatusBadge`, `StatusIndicator`, `TableDropdownMenu`, `VirtualizedListbox`, `CenteredContentLayout` | Root UI (domain-free) |
| `ModelAutocomplete` | Remove after consumer search (test-only) |
| `ui/hooks/*` (4 files) | Root `renderer/hooks` |

Root UI dependency violations (final rule: no App/Domains/API/RPC/Helpers
imports): `ui/hooks/useRefreshableLoader.ts`. It is baselined; Phase 26 moves it.
