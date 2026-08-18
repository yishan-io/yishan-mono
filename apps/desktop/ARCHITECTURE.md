# Desktop Renderer Architecture

This document defines the stable ownership model for the Electron Renderer
(`apps/desktop/src/renderer`). It is the contract enforced by
`src/renderer/architecture.test.ts` and the mandatory reading for any change
in the Renderer.

The Electron main process (`src/main`) is outside this document. Change it only
when a Renderer boundary requires a host contract change.

## Top-Level Owners

| Path | Owner | Examples |
|---|---|---|
| `app/` | Renderer composition root | `RendererApplication.tsx`, `routes/`, `commands/`, `flows/`, `events/`, `runtime/`, `selectors.ts` |
| `domains/` | Product behavior, split by Feature | `workspace/`, `agent/`, `settings/`, `terminal/`, `workbench/`, … |
| `api/`, `rpc/` | Infrastructure (transport) | REST clients, daemon JSON-RPC clients, DTO types |
| `ui/` | Shared UI (components, hooks, layout) | `ui/components`, `ui/hooks`, `ui/layout` |
| `components/`, `helpers/` | Migration buckets, being retired | Product behavior here is being moved to Feature owners (Phase 19) |

The Renderer has 14 Features: `agent`, `files`, `git`, `node`, `notification`,
`organization`, `overview`, `project`, `scheduled-job`, `session`, `settings`,
`terminal`, `workbench`, `workspace`.

## Feature Layers

Each Feature may contain these layers. A layer is a directory, not a class.

| Layer | Owns | May import | Must not import |
|---|---|---|---|
| `model/` | Pure data types and rules | own Model, own State types | React, Zustand, Electron, `api/`, `rpc/`, Runtime, State implementations |
| `state/` | Zustand State, Selectors, synchronous mutations | own Model, own State, Zustand | `api/`, `rpc/`, Electron, Commands, Runtime, another Feature's State |
| `commands/` | Command surfaces that mutate State and call Ports | own Model, own State, own Runtime, Ports | Views, Components, transport implementations |
| `runtime/` | Timers, subscriptions, registries, queues, external instances | own Model, own State, Ports | UI, transport implementations |
| `events/` | Feature event handlers subscribed to application events | own State, Commands, Ports | another Feature's State, Runtime, or Event handlers |
| `ui/` | Feature presentation | own Commands, own Selectors, public read surfaces of other Features | `api/`, `rpc/`, Electron, main-process code, another Feature's internal State/Runtime/Events |

`flows/` exists at the application level only (`app/flows`) and owns
multi-Feature workflows.

## Feature Public API

A Feature's `index.ts` is its public API. It may export:

- Command contract types.
- Command entry functions when composition requires them.
- Domain Models.
- State Selectors (read models).
- Read-only hooks with a stable contract.
- Stable UI entry points.

A Feature must not export:

- A Store instance for another Feature to mutate.
- A Runtime implementation.
- An Event Handler implementation.
- Internal State mutations with business meaning.
- Transport DTOs as domain Models.

State Selectors and Actions files (`*Selectors.ts`, `*Actions.ts`) are the
public State surface and are importable across Features. Stores themselves are
internal to the owning Feature.

## Route and Page Ownership

`app/routes/` owns the route table and page composition (`AppRoutes.tsx`).
Route pages compose Feature UI entry points. They may import Feature public
APIs but not Feature internals.

## Store and Selector Placement

- Each Feature owns its Zustand stores in `domains/<domain>/state/`.
- A Selector reads its own Feature's State only.
- Cross-Feature reads use the other Feature's public Selectors, or an
  application read model in `app/selectors.ts` when the read combines data
  from several Features.
- Do not create a combined Store for screen data. Derive screen data from
  Feature Selectors.

## Hook Classification

- Hooks that read State, Selectors, or Commands live in the owning Feature's
  `ui/hooks` (or `ui/`).
- Hooks that own timers, subscriptions, or other runtime resources move to an
  application or Feature Runtime and receive explicit start/stop behavior.
- Pure transforms are Model functions, not hooks.

## Cross-Feature Composition

Cross-Feature workflows belong to `app/commands` or `app/flows`. Application
code composes Feature public APIs; Features never compose one another's
internals.

## Required Dependency Direction

```text
main
  -> app
      -> feature public APIs
      -> infrastructure

feature UI
  -> own Commands
  -> own State Selectors
  -> public read surfaces from other Features

feature Commands
  -> own Model
  -> own State
  -> own Runtime
  -> Ports

infrastructure
  -> Ports
  -> transport DTOs
```

## Architecture Test and Exception Policy

`src/renderer/architecture.test.ts` enforces the rules above (R1, R1b, R3–R9).
It has one focused test group per rule and fails on:

- a new boundary violation (with file and import target);
- a stale allowlist row (violation already fixed);
- an allowlist row tagged with a completed phase.

`src/renderer/architecture.knownViolations.ts` is the allowlist. Rows record
pre-existing violations that later phases remove. Every row carries the tag of
the phase that currently owns the baseline (`CURRENT_PHASE`); rows for
completed phases are rejected. A phase that fixes a violation removes its row
in the same pull request.

The violation count must not increase during a phase. Record the count in each
refactor pull request.

## Current Status

The Renderer ownership refactor runs in Phases 0–20. Phases 11–15 completed
the file migration (`app` root, Feature ownership, command surfaces). Phases
16–20 close the remaining dependency boundaries. Phase 16 made the
architecture test accurate (per-rule tests, no State/Zustand false positive,
strict allowlist lifecycle) and this document mandatory.
