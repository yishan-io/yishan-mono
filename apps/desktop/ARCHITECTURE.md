# Desktop Renderer Architecture

This document defines the stable ownership model for the Electron Renderer
(`apps/desktop/src/renderer`). It is the contract enforced by
`src/renderer/architecture.test.ts` and the mandatory reading for any change
in the Renderer.

The Electron main process (`src/main`) is outside this document. Change it only
when a Renderer boundary requires a host contract change. Its ownership model is
[documented separately](./src/main/ARCHITECTURE.md).

Use `../../.my-context/architecture/refactor/desktop-domain-rules.md` as the
detailed Domain specification. Finish responsibility normalization with
`desktop8-domain-plan.md`, then use `desktop9.md` for Domain module closure.

## Top-Level Owners

| Path | Owner | Examples |
|---|---|---|
| `app/` | Renderer composition root | `RendererApplication.tsx`, `routes/`, `commands/`, `events/`, `runtime/`, `selectors.ts` |
| `domains/` | Product behavior, split by Domain | `workspace/`, `agent/`, `settings/`, `terminal/`, `workbench/`, … |
| `api/`, `rpc/` | Infrastructure (transport) | REST clients, daemon JSON-RPC clients, DTO types |
| `hooks/` | Domain-free React behavior | request guards, refresh behavior, context-menu behavior |
| `ui/` | Domain-free stateless presentation | primitive controls, layout, generic visual feedback |
| Named root capabilities | Business-neutral facilities | `async/`, `path/`, `platform/`, `shortcuts/` |

Do not create root `helpers/`, `utils/`, `common/`, `services/`, or generic
`shared/` buckets.

The Renderer has 15 Domains: `agent`, `browser`, `files`, `git`, `node`,
`notification`, `organization`, `overview`, `project`, `scheduled-job`,
`session`, `settings`, `terminal`, `workbench`, `workspace`.

## Domain Layers

A Domain uses only the directories required by its responsibilities:

| Layer | Responsibility |
|---|---|
| `features/<use-case>/` | One use case or smart UI group, including its local UI, Hooks, State, types, and helpers |
| `ui/` | Stateless Domain presentation shared by several Features |
| `hooks/` | React behavior or lifecycle shared by several Features |
| `state/` | Mutable Domain data and synchronous actions |
| `commands/` | Business operations and use cases that add coordination or policy |
| `subscriptions/` | Reactions to asynchronous facts owned by the Domain |
| `runtime/` | Long-lived resources with explicit start, stop, or cleanup |
| `daemon/`, `api/`, `host/`, `persistence/` | Concrete external boundaries and DTO mapping |
| `<named-concept>/` | Optional cohesive internal module named with business vocabulary |

Do not require `model/`, `services/`, `infrastructure/`, `commands/`,
`subscriptions/`, or `runtime/` in every Domain. Do not create empty layers.

Feature-local code stays in its Feature. Domain `ui/` does not read Stores,
call Commands, perform I/O, or own lifecycle resources. A Hook is kept only
for real React behavior, not to rename one Store selector or action.

Subscriptions own simple subscribe/unsubscribe reactions. Runtime is reserved
for registries, processes, queues, timers, reconnecting subscriptions, and
other independently managed resources. Do not create Domain `events/`.

Stable concepts and pure decisions can remain as focused files. When several
files form one concept family, create a named module such as `chat/`,
`providers/`, `naming/`, `pull-request/`, `schedule/`, or `tabs/`. Do not use
generic `concepts/`, `core/`, `utils/`, `helpers/`, or `misc/` buckets.

## Domain Public API

A Domain's root `index.ts` is its only cross-Domain public API. Use explicit
named exports. Do not use `export *`.

The index can export intentional Stores, public Store types and actions,
business operations, stable concepts, required Hooks, and UI entry points with
real external Consumers. It must not export external clients, internal Runtime
registries, compatibility aliases, or Feature-local details.

External Consumers can read a public Store and call its public actions. They
must not call `setState()`, mutate returned State, or deep-import `state/`.

A Feature or named internal module can have an `index.ts` only when Consumers
outside that module use several exports as one cohesive API. Do not add an
index mechanically to every technical directory. Domain-internal code imports
concrete files or an intentional internal-module index; it must not import its
own root index.

The root index is an API catalogue. Do not add otherwise-unused imports for
initialization or ordering.

## Route and Page Ownership

`app/routes/` owns the route table and page composition (`AppRoutes.tsx`).
Route pages compose Domain UI entry points. They may import Domain public
APIs but not Domain internals.

## Store and Selector Placement

- Each Domain owns its Zustand Stores in `domains/<domain>/state/`.
- React Consumers subscribe with `store(selector)`.
- Non-React Consumers read a snapshot with `store.getState()`.
- Consumers call public actions with `store.getState().action()`.
- Public Store actions are synchronous, preserve invariants, and do not own
  I/O, subscriptions, or cross-Domain coordination.
- Keep a selector only for reused or complex pure derivation.
- Do not keep a getter, Hook, or action wrapper that only forwards Store use.
- Cross-Domain projections belong in `app/selectors.ts`.

## Hook Classification

- A Hook used by one Feature stays in that Feature.
- A Hook shared by multiple Features in one Domain lives in that Domain's
  `hooks/` directory.
- A domain-free Hook lives in the root `renderer/hooks/` directory.
- Hooks that own timers, subscriptions, or other runtime resources move to an
  application or Domain Runtime and receive explicit start/stop behavior.
- Pure transforms are normal functions, not Hooks. Keep them with their owning
  Feature or named Domain concept.

## Cross-Domain Composition

Cross-Domain workflows belong to `app/commands` or `app/events`. Application
code composes Domain public APIs; Domains never compose one another's
internals, and Domains never import `app`.

## Required Dependency Direction

```text
main -> app -> Domain public APIs

Feature -> own Domain modules -> other Domain public APIs
Domain ui -> React + props + root ui
Command -> own State + concrete adapters + public Domain APIs
Subscription -> normalized event + own State or Command
adapter -> transport + DTO mapping
```

Domains do not import `app`. App and other Domains do not deep-import Domain
internals.

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

A Domain is complete when it has a clear owner and responsibility list,
Feature-local code stays in its use-case Feature, Domain UI is shared stateless
presentation, external I/O stays behind a concrete boundary, other Domains use
only the public `index.ts`, and the relevant checks and tests pass.

## Historical Refactor Record

The phase names and old directory names below describe completed migrations.
They are not current placement rules. Use the earlier normative sections and
`desktop-domain-rules.md` for new changes.

The Renderer ownership refactor runs under the Desktop Domains plan. Phase D1
renamed `features/` to `domains/` (mechanical, no behavior change). Phase D2
prepared Domain-by-Domain enforcement: the architecture test now enforces
cross-Domain imports through public `index.ts` (R14), forbids Domain imports
of `app` (R15), forbids App deep imports into a Domain (R16), and tags every
allowlist row with the Domain phase that removes it. The Domain phases D3–D17
normalize one Domain at a time.

Execution moved to `refactor/desktop7.md` (Phases 21–27). D6–D16 are
completed. Phase 22 closed the App→Domain R16 boundary (R16 = 0). Phase 23
normalized Settings. Phases 24–25 are complete: workspace/workbench/project and
files/git/terminal/agent/browser each pass the Domain Completion Method; the
combined Project/Node/Workspace navigator moved to
`app/features/project-workspace-navigator`; create/rename-workspace are split
Features; every Domain RPC client and DTO moved to Domain Infrastructure over
the root transport (`getDaemonTransport`), so root RPC is now a pure transport
core (connection, correlation, timeouts, raw subscriptions, binary frames) with
zero domain clients or domain DTOs.

Phases 26–27 (complete): see the per-phase records below. Phase 26 normalized the six remaining Domains and closed root residue; Phase 27 enforced the final architecture (see below). Phase 26 (complete): session/node/organization/notification/overview/
scheduled-job each pass the Domain Completion Method; scheduled-job form split
(create/update/detail/list Features, shared fields in `ui`, form behavior in
`hooks`, cron/schedule rules in `model`). Root residue closed:
- Root `helpers/` removed. Capabilities: `platform/` (clipboard, platform),
  `async/` (delay, withTimeout), `ids/` (generateId), `path/` (pathHelpers),
  `version/` (version compare), `ui/typography` (MONOSPACE_SX),
  `ui/codeThemes`. `errorHelpers` facade removed (importers use
  `@shared/helpers/errorHelpers`); `issueLinks`/`tabHelpers` removed (zero
  consumers); formatters split to the resource-usage and overview Features;
  `terminalCloseTombstones` moved to Terminal Model (app consumes via the
  Terminal public API).
- Root `ui/hooks` removed → `renderer/hooks`.
- Root `events/` is now the named backend-event + focus-intent capability
  (adapter/router/selectors implementation moved from `app/events`, which
  keeps only the handler composition).
- Root `navigation/` removed (zero consumers); root `search/` removed
  (provider functions had zero consumers; the quick-open type comes from the
  Files Domain).
- Root `api/` keeps only the REST transport (`restClient`) and shared record
  types (`types`); every per-resource REST client moved to its Domain
  Infrastructure.
- Root `shortcuts/` stays the named keybinding framework capability.

Phase 27 (complete): final architecture enforcement.
- New enforced rules (archtest now 29): R17 Domain must not VALUE-import its
  own root index (type-only allowed), R18 no wildcard exports in Domain root
  indexes, R19 root RPC imports only from `app/events`, `app/runtime`, and
  Domain Infrastructure, R20 Model/State/Hooks/UI/Features do not import root
  transport; the root UI rejection list adds IPC/Stores/Commands/Runtime.
- R1b (@shared/contracts UI imports) is now enforced at 0.
- The desktop host bridge (`getDesktopBridge`/`getDesktopHostBridge`) moved
  out of root RPC into `platform/hostBridge`; root RPC keeps only connection,
  wire protocol, correlation, timeouts, and raw subscription code.
- The backend-event pipeline implementation lives in `app/events` (the
  whitelisted home for transport access); root `events/` re-exports it for
  Domains (R15-safe) and keeps the composer/terminal focus-intent bridges.
- Domain transport subscriptions route through Domain Infrastructure
  (session/agent/terminal/workbench/workspace wrappers).
- `ModelAutocomplete` removed (test-only, no production consumer).
- Allowlist rows: none (empty); `COMPLETED_PHASES` includes P21–P27.

## Root Capabilities (desktop7 Phase 26)

Root `helpers` and root `ui/hooks` no longer exist (desktop7 Phase 26).
The migration baselines in `architecture.migrationBaselines.ts` are empty but
the guard tests remain: the architecture test rejects re-creating root
`helpers` files/importers, new `ui/hooks` files, and new root UI dependency
violations.

Named root capabilities (business-neutral, with written dependency rules):

| Capability | Contents | Dependency rule |
|---|---|---|
| `rpc/` | Transport core: connection, correlation, timeouts, raw subscriptions, binary frames, wire types | Domain access only through concrete Domain boundary directories (`daemon/`, `api/`, `host/`, `persistence/`); root RPC imports only from `app/events`, `app/runtime`, root `events`, and those boundaries |
| `events/` | Root backend-event capability: adapter/router/selectors + the desktop RPC event bus | May import root `rpc` and `shared` only; must not import App, Domains, API, or UI |
| `api/` | REST transport (`restClient`) + shared REST record types (`types`) | Per-resource clients live in Domain `api/` directories; UI may type-import `api/types` only |
| `shortcuts/` | Keybinding framework (metadata, runner, display, overrides) | Framework capability; Domains/App consume via named exports only |
| `platform/` | clipboard, platform detection, host bridge | May import root `rpc` (host bridge) only |
| `hooks/` | Domain-free React behavior (RouteCloseWatcher, context-menu state, request guard, refreshable loader) | No App/Domains/API/RPC imports |
| `ui/` | Domain-free stateless presentation (components, typography, codeThemes) | No App/Domains/API/RPC/Stores/Commands/Runtime imports |

## Current State (desktop8/desktop9)

The Desktop 8 domain-by-domain normalization (Model A) and the Desktop 9
module closure are complete. The final tree obeys `desktop-domain-rules.md`:

- **No generic buckets.** No Domain has `model/`, `services/`, `rules/`, or
  `infrastructure/` directories. Concepts are named root files or named
  internal modules (e.g. `tabs/`, `split-pane/`, `chat/`, `providers/`,
  `naming/`, `local-folder/`, `pull-request/`, `schedule/`).
- **Stores are public State APIs.** A Domain exports its raw Store from its
  `index.ts`. External code reads with `store.getState()`, subscribes with
  `store(selector)`, and calls actions with `store.getState().action()`.
  Getter/action/Hook wrapper layers are banned; external `setState()` is
  banned; deep `state/` imports are banned (index only).
- **Concrete external boundaries.** Each Domain uses `daemon/`, `api/`,
  `host/`, or `persistence/` for external I/O. Host adapters are not named
  `Commands`.
- **Named modules have indexes.** A named business module (multi-file,
  several consumers) has an explicit `index.ts`; technical directories
  (`state/`, `commands/`, `hooks/`, `ui/`, `daemon/`, `api/`, `host/`,
  `subscriptions/`, `runtime/`) and one-file directories do not.
- **No `Utils`/`Helpers` suffixes.** New filenames ending in `Utils`/`Helpers`
  are rejected (R27).
- **Domain UI is business-stateless.** A Domain `ui/` file must not
  VALUE-import State, Commands, API/RPC/daemon/host/persistence transport,
  Runtime, Subscriptions, or Zustand (R28, desktop10 Phase 44). It receives
  business data and actions through Props and may own local interaction
  state. Type-only imports and other-Domain public UI are allowed.
- **Theme creation and preference are separated.** `renderer/ui/theme.ts`
  owns MUI theme creation and Renderer-wide Theme types
  (`createAppTheme`, `AppThemeMode`, `DARK_SURFACE_COLORS`); Settings owns
  the user preference type and mode resolution
  (`AppThemePreference`, `resolveAppThemeMode` in `settings/state/`,
  exported via the settings index). The Renderer global stylesheet
  (`global.css`) keeps only document reset, sizing, default font, global
  background, and Electron drag-region rules; Feature/third-party CSS
  overrides live beside their owning integration.
- **Domain event listeners live in `subscriptions/`.** No Domain has an
  `events/` directory.
- **Command contracts are gone.** No Domain has a `commands/contract.ts`
  mirror.

The architecture test enforces these rules with zero allowlist rows (R1–R28).

Business-neutral primitives `async`, `ids`, `path`, and `version` live in
`src/shared` (Phase 32) — `shared/async`, `shared/ids/generateId`,
`shared/path/paths`, `shared/version`.

Phase 26 resolutions of the Phase 21 provisional owners: workspace helpers →
Workspace (Phase 24); files/git/terminal/agent helpers → their Domains
(Phase 25); `terminalCloseTombstones` → Terminal Model; `clipboard`/`platform`
→ `platform/`; `delay`/`withTimeout` → `async/`; `generateId` → `ids/`;
`pathHelpers` → `path/`; `styles` → `ui/typography`; `codeThemes` →
`ui/codeThemes`; `version`/`versionHelpers` → `version/`; `errorHelpers`
facade removed (canonical `@shared/helpers/errorHelpers`); `formatters` split
to owning Features; `issueLinks`/`tabHelpers`/`syntaxThemeComparison` removed
after consumer search. `ui/hooks/*` → `renderer/hooks`; `RouteCloseWatcher`
already at `renderer/hooks`; root UI components stayed domain-free.
