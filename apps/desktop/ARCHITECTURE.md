# Desktop Renderer Architecture

This document defines the stable ownership model for the Electron Renderer
(`apps/desktop/src/renderer`). It is the contract enforced by
`src/renderer/architecture.test.ts` and the mandatory reading for any change
in the Renderer.

The Electron main process (`src/main`) is outside this document. Change it only
when a Renderer boundary requires a host contract change.

Use `refactor/desktop-domains-refactor-plan.md` for the Domain normalization
order and completion criteria. Use
`refactor/desktop-ownership-first-normalization.md` for ownership selection.

## Top-Level Owners

| Path | Owner | Examples |
|---|---|---|
| `app/` | Renderer composition root | `RendererApplication.tsx`, `routes/`, `commands/`, `events/`, `runtime/`, `selectors.ts` |
| `domains/` | Product behavior, split by Domain | `workspace/`, `agent/`, `settings/`, `terminal/`, `workbench/`, … |
| `api/`, `rpc/` | Infrastructure (transport) | REST clients, daemon JSON-RPC clients, DTO types |
| `ui/` | Shared UI (components, hooks, layout) | `ui/components`, `ui/hooks`, `ui/layout` |
| `components/`, `helpers/` | Migration buckets, being retired | Product behavior here is moved to Domain owners (D17 Final Closure) |

The Renderer has 14 Domains: `agent`, `files`, `git`, `node`, `notification`,
`organization`, `overview`, `project`, `scheduled-job`, `session`, `settings`,
`terminal`, `workbench`, `workspace`.

## Domain Layers

Each Domain may contain these layers. A layer is a directory, not a class.

| Layer | Owns | May import | Must not import |
|---|---|---|---|
| `model/` | Pure data types and rules | own Model, own State types | React, Zustand, Electron, `api/`, `rpc/`, Runtime, State implementations |
| `state/` | Zustand State, Selectors, synchronous mutations | own Model, own State, Zustand | `api/`, `rpc/`, Electron, Commands, Runtime, another Domain's State |
| `commands/` | Command surfaces that mutate State and call Ports | own Model, own State, own Runtime, Ports | Views, Components, transport implementations |
| `runtime/` | Timers, subscriptions, registries, queues, external instances | own Model, own State, Ports | UI, transport implementations |
| `events/` | Domain event handlers subscribed to application events | own State, Commands, Ports | another Domain's State, Runtime, or Event handlers |
| `ui/` | Domain presentation | own Commands, own Selectors, public read surfaces of other Domains | `api/`, `rpc/`, Electron, main-process code, another Domain's internal State/Runtime/Events |

`flows/` exists at the application level only (`app/flows`) and owns
multi-Domain workflows. It is a migration source; do not add new files there.

## Domain Public API

A Domain's `index.ts` is its public API. It may export:

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

- Hooks that read State, Selectors, or Commands live in the owning Domain's
  `ui/hooks` (or `ui/`).
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
  -> own Commands
  -> own State Selectors
  -> public read surfaces from other Domains

Domain Commands
  -> own Model
  -> own State
  -> own Runtime
  -> Ports

infrastructure
  -> Ports
  -> transport DTOs
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
| D5 | `node` | `planned` | Establish node discovery, selection data, and administration ownership. |
| D6 | `project` | `planned` | Establish project identity, configuration, grouping, and list behavior. |
| D7 | `workbench` | `planned` | Establish active context, tabs, panes, layout, and presentation Commands. |
| D8 | `workspace` | `planned` | Establish Workspace lifecycle, creation, health, and Workspace-specific UI. |
| D9 | `files` | `planned` | Establish file browsing, editing, search, and editor behavior. |
| D10 | `git` | `planned` | Establish Git, diff, branch, commit, and pull-request ownership. |
| D11 | `terminal` | `planned` | Establish terminal sessions, instances, transport, focus, and recovery. |
| D12 | `agent` | `planned` | Establish Agent sessions, providers, messages, streams, and Agent UI. |
| D13 | `notification` | `planned` | Establish notification decisions, delivery, sound, and preferences. |
| D14 | `overview` | `planned` | Establish usage data, filters, charts, and overview loading. |
| D15 | `scheduled-job` | `planned` | Establish job definitions, execution controls, and run history. |
| D16 | `settings` | `planned` | Keep only the settings shell and preferences without a stronger Domain owner. |
| D17 | (Final Closure) | `planned` | Remove remaining root behavior, complete the App ownership audit, zero active violations. |

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
