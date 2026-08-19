# Coding Guide

This guide defines how code is written, structured, and reviewed across the yishan monorepo.
It is the source of truth for AI agents and human contributors alike. Follow it for every
change — new features, refactors, and bug fixes.

---

## Table of Contents

1. [Monorepo Structure](#1-monorepo-structure)
2. [General Principles](#2-general-principles)
3. [TypeScript / JavaScript (desktop, api-service, landing)](#3-typescript--javascript)
4. [React and Component Design (desktop)](#4-react-and-component-design)
5. [State Management (desktop)](#5-state-management)
6. [API Design (api-service)](#6-api-design)
7. [Go (cli, relay)](#7-go)
8. [Naming Conventions](#8-naming-conventions)
9. [Error Handling](#9-error-handling)
10. [Testing](#10-testing)
11. [File Size and Splitting](#11-file-size-and-splitting)
12. [Performance Rules](#12-performance-rules)
13. [What AI Agents Must Not Do](#13-what-ai-agents-must-not-do)

---

## 1. Monorepo Structure

```
apps/
  api-service/    Hono REST API — Cloudflare Workers / Bun
  cli/            Go CLI daemon — Cobra + internal packages
  desktop/        Electron app — React + MUI + Zustand
  landing/        Next.js marketing page
  relay/          Go WebSocket relay server
packages/
  core/           Shared cross-app types (bootstrap in progress)
  design-tokens/  MUI + React Native token layer
```

**Rules:**
- Code that is only used by one app lives inside that app. Do not create a shared package
  for a single consumer.
- Code shared between `api-service` and `desktop` belongs in `packages/core`.
- `packages/design-tokens` owns all colour, typography, shape, and elevation tokens.
  Do not define raw colour values elsewhere.
- Path aliases (`@/`) are configured per-app in `tsconfig.json`. Do not use `../../../`
  chains longer than 3 levels — create a path alias instead.

---

## 2. General Principles

### One concern per file
A file owns one thing: one component, one store, one service, one command group.
When a file exceeds **500 lines**, it is a signal to split.

### No business logic in the wrong layer
Each app has a defined layering contract. Do not skip layers.

| App | Layer contract |
|---|---|
| `desktop` | views → commands → store actions → domain helpers |
| `api-service` | routes → handlers → services → db (Drizzle) |
| `cli` | cmd → daemon (transport) → `workspace/application.Service` (create/close) → workspace interfaces → adapters (`instance`, `worktree`, `apiclient`, `dbconv`, `relay`) |
| `relay` | cmd → internal/relay → internal/jobqueue, internal/auth |

**A handler must not query the database.** A view must not call a store action's domain
helper directly. A command must not instantiate a service it does not own.

### No duplication
Before writing a utility function, check if it already exists. If the same logic appears
in two places, extract it on the third occurrence at the latest.

### No magic values
Every string or number that appears more than once, or that has semantic meaning, must be
a named constant. Name it at the point of first definition.

### Explicit over clever
Prefer readable code over short code. Name variables after what they represent in the
domain, not after their type.

---

## 3. TypeScript / JavaScript

### Language settings
- **TypeScript strict mode** is enabled in all apps.
- `any` is banned. Use `unknown` and narrow explicitly.
- `as SomeType` casts are permitted only when the type has already been validated (e.g.
  after a Zod parse or an `instanceof` check). A bare `as` without a preceding check is
  a bug.
- All exported functions, types, and classes must have JSDoc comments.

### Formatting
Enforced by **Biome** (`biome.json` at the repo root):
- 2-space indentation
- 120-character line width
- Organised imports (Biome handles ordering)

Run before committing:
```bash
bun run typecheck
bun run lint
```

### Imports
- Group imports: external packages first, then internal (`@/`, relative).
- Biome's `organizeImports` handles ordering automatically — do not sort manually.
- Prefer named exports. Default exports are only for React components that match the
  filename exactly.
- Never import from a store's internal domain folder directly (e.g., do not import from
  `store/tabs-domain/` outside of `store/tabStore.ts`).

### Async/await
- Always `await` promises. Do not discard them with `void` unless the intent is
  explicitly fire-and-forget, in which case add a `// fire-and-forget: <reason>` comment.
- `try/catch` must never be empty. Always log or re-throw.

### Utility functions
- `getErrorMessage(error: unknown): string` — use this everywhere an error needs to be
  converted to a string. Located at `apps/desktop/src/renderer/errors/getErrorMessage.ts`.
- `generateId(): string` — use this for all UUID/random-ID generation. Located at
  `apps/desktop/src/renderer/helpers/generateId.ts`.
- Do not inline `error instanceof Error ? error.message : String(error)` — that is what
  `getErrorMessage` is for.
- Do not inline `crypto.randomUUID()` — use `generateId()`.

---

## 4. React and Component Design

### Component rules
- One component per file. The filename matches the component name exactly.
- Components must be functions. No class components.
- Props interfaces are defined in the same file, directly above the component.
- A component that exceeds **300 lines** must be decomposed.

### Extract when duplicated
If the same JSX structure appears in two files, extract it into a shared component in
`apps/desktop/src/renderer/components/`. Name the component after what it represents,
not what it renders (e.g., `ConfirmationDialog`, not `ModalWithTwoButtons`).

### Hooks
- Custom hooks live in `apps/desktop/src/renderer/hooks/` (global) or co-located with
  their view in the same directory if they are single-use.
- A hook that exceeds **150 lines** must be split.
- Hooks must not call other hooks conditionally.
- Side effects (`useEffect`) must always return a cleanup function if they start a
  subscription, timer, or async operation.

### MUI usage
- Use `sx` prop for one-off styles. Extract to a named constant if the same `sx` object
  appears in more than one file.
- Do not use inline `style={{}}` for anything other than dynamic computed values (e.g.
  virtualised row positions).
- Use `Box` for layout. Use `Typography` for text. Do not use raw `<div>` / `<p>` / `<span>`.
- Theme tokens come from `packages/design-tokens`. Do not hardcode hex values.

### Rendering performance
- Wrap callbacks in `useCallback` when passed as props to child components.
- Wrap expensive computations in `useMemo`.
- Do not create new object or array literals inside JSX — define them outside the return.

---

## 5. State Management

### Zustand store rules
- Each store owns one domain. Do not mix concerns.
- Stores are the **only** place that hold mutable application state. Views read from stores;
  commands write to stores.
- Do not import one store from inside another store's mutation function. If a mutation
  needs state from another store, the **command** layer is responsible for reading both
  stores and passing the values as arguments to each store's action.
- Persisted stores (using Zustand `persist`) must define a `partialize` function that
  explicitly lists every field to persist. Never persist derived state or function fields.

### Naming: the `Store` suffix is required on the instance and filename

Zustand store instances are used in two ways in the same codebase:

```ts
// As a React hook (inside a component):
const workspaces = workspaceStore((state) => state.workspaces);

// As a plain object (in commands, outside React):
workspaceStore.getState().addWorkspace(ws);
```

The `Store` suffix disambiguates the object from the domain it describes. Without it,
`workspace((state) => ...)` is unreadable. The suffix is not optional.

Rules:
- Store instance variable: `<domain>Store` — e.g., `workspaceStore`, `tabStore`
- Store filename: `<domain>Store.ts` — e.g., `workspaceStore.ts`, `tabStore.ts`
- Store state type: `<Domain>StoreState` — e.g., `WorkspaceStoreState`, `TabStoreState`
- Settings stores in `store/settings/` follow the same convention: `agentSettingsStore.ts`

The `Domain` suffix on **subfolder names** (`tabs-domain/`, `split-pane-domain/`) is not
used. Subfolders within `store/` are named after the domain they serve, without a suffix:
`tabs/`, `split-pane/`, `workspace/`. The `store/` parent already provides the context.

### Store file structure
```
store/
  # Core runtime stores — stay at root
  workspaceStore.ts, tabStore.ts, splitPaneStore.ts, chatStore.ts, sessionStore.ts, types.ts

  # workspaceStore internals
  workspace/
    actions.ts, actions.projects.ts, actions.selection.ts, actions.workspaces.ts, state.ts

  # Persisted user settings — Store suffix on each file
  settings/
    agentSettingsStore.ts, gitBranchStore.ts, layoutStore.ts

  # Domain logic (pure functions, no Zustand) — plain names, no suffix
  tabs/, split-pane/
```

### Commands vs actions vs views
- **Views** call commands (via `useCommands()`) — never store actions directly.
- **Commands** orchestrate: they call the API or daemon, then update one or more stores.
- **Store actions** are pure state mutations — no I/O, no API calls.
- **Domain helpers** (`tabs-domain/`, `split-pane-domain/`) are pure functions: they take
  state snapshots and return state patches.

---

## 6. API Design

### Route → handler → service → db
```
routes/*.ts       Zod validation, auth middleware, route registration
handlers/*.ts     Extract params from context, call one service method, return JSON
services/*.ts     Business logic, database queries via Drizzle
db/schema.ts      Table definitions, type exports
```

**A handler must not query the database.** Always delegate to a service method.

### Validation
- Every route that accepts a body or query params must use `zValidator` from
  `@hono/zod-validator`. Never manually parse `c.req.json()`.
- Validation schemas live in `src/validation/`. One file per domain
  (e.g. `validation/project.ts`, `validation/user.ts`).
- Use `nonEmptyStringSchema` from `validation/common.ts` for any required string field.
- Export reusable param schemas (e.g. `orgIdParamSchema`) from `validation/common.ts`
  and compose with `.extend()` or `.merge()` — do not copy-paste `z.object({ orgId })`.

### Error handling
- Throw typed `AppError` subclasses from service methods. Never return error objects.
- All `AppError` subclasses are defined in `src/errors/index.ts`.
- The `handleAppError` middleware formats all thrown `AppError` into a consistent
  `{ error, code, ...details }` response shape. Do not call `c.json({ error: ... })` in
  handlers for domain errors — throw instead.
- Every new error case must have a typed `AppError` subclass. Adding a raw string to an
  existing response is not acceptable.

### Services
- Each service is a class that accepts `private readonly db: AppDb` in its constructor.
- Services must not import from other services' files directly. If service A needs
  service B's logic, service B is injected via constructor at wiring time (`services/index.ts`).
- Repeated access-control patterns must be extracted to shared helpers in
  `services/shared/`. The `assertOrganizationMember(db, organizationId, actorUserId)`
  pattern must not be copy-pasted — import the shared helper.
- Multi-step writes that must be atomic must be wrapped in `db.transaction(async (tx) => ...)`.

### Types
- Domain types exported from `db/schema.ts` must be imported from there. Do not re-declare
  them locally in service files.
- `ScheduledAgentKind`, `WorkspaceKind`, `ProjectSourceType`, `OrganizationMemberRole` are
  canonical exports from `db/schema.ts`. Import them — do not copy the union.

---

## 7. Go

### Package structure (cli)
```
cmd/                Cobra command definitions only — no business logic
internal/
  app/              Composition root: builds the 5 node services, the rpc
                    transport, and the relay client; owns startup/shutdown
  daemon/           Daemon process lifecycle (lock, state, HTTP serving) + daemon client
  rpc/              JSON-RPC/WebSocket transport, router, namespace handlers,
                    wire error codes (MapRPCError)
  node/             Local Node application boundary, split into vertical services:
    workspace/        workspace.*/file.*/git.* + lifecycle application ops
    agent/            pi.*/skill.*/customize.* + task runs + session registry
    terminal/         terminal.* + remote stream state + binary frames
    project/          project.* (list, preferences)
    system/           system.*/memory.*/computer.*/context.* + cli tools
    hook/             agent hook ingress (pi notify bridge)
    context/          renderer context store
  workspace/        Workspace domain types + lifecycle rules + application/
    instance/ pr/ watchers/ worktree/
  agent/            Agent domain: session/process/command/setup/auth/catalog/kind
  tokenusage/       Usage domain: collection/scanner/attribution/pricing/repository
  memory/           Memory domain: store/reconcile/summarizer/persona
  files/ git/ terminal/ computer/   Standalone capability packages
  adapter/
    cloud/            Cloud API client + DTOs (+ session, login)
    sqlite/           SQLite store + migrations + row conversion
    relay/            Relay envelopes + relay client
  platform/
    config/           Environment config reading
    shellenv/         Shell environment resolution
    logging/          Log file management
    release/          Self-update + build info
  eventbus/         Application event publication and subscription (frontend event hub)
  archtest/         Forbidden-import architecture test
```

### Workspace lifecycle layering (cli daemon)
- Final CLI package dependency contract (Phases 13–19):
  `daemon -> app`; `app -> node services + rpc + adapters + platform + domain`;
  `rpc -> service interfaces + domain error mappers`;
  `node services -> domain owners + capability interfaces`;
  `adapters -> domain vocabulary`; `domain -X-> rpc/daemon/app/adapters`;
  `capability owners -X-> rpc/daemon/app`. Enforced by `internal/archtest`.
- `internal/app` is the only composition root: `app.Bootstrap` builds the five
  vertical node services (`workspace`, `agent`, `terminal`, `project`, `system`),
  the rpc transport (`appHandler` adapts the router + desktop-connection
  tracking), the relay client (`relayHandler` dispatches job.run / workspace
  snapshot / terminal messages), and the hook ingress. `App.Close` owns the
  shutdown order. The daemon only serves: `Run` resolves the account data dir
  and calls `app.Bootstrap`.
- Each node service implements only its namespace's RPC service interfaces
  (`rpc.WorkspaceService`, `PiService`, `TerminalService`, ...) and receives a
  small explicit dependency struct. Cross-service dependencies are injected as
  callbacks or interfaces (e.g. `agent.WorkspaceResolver`,
  `workspace.Deps.CreateCompleted`) — services never import each other's
  concrete types in a cycle.
- The JSON-RPC transport lives in `internal/rpc`: `Server` (WebSocket read
  loop, concurrency limits, binary terminal frames), `Connection`, `Router`,
  protocol types, and one namespace handler per RPC namespace
  (`WorkspaceHandler`, `FileHandler`, `GitHandler`, `TerminalHandler`,
  `MemoryHandler`, `ComputerHandler`, `ContextHandler`, `ProjectHandler`,
  `SystemHandler`, `AgentHandler`). Each handler decodes params and calls
  exactly one typed method on a per-namespace service interface.
- Error ownership: domain and capability owners return their own errors
  (`workspace.Error`, `files.Error`, `git.Error`, ...); `rpc.MapRPCError`
  maps them to wire errors. `rpc` owns the JSON-RPC numeric codes; the
  command output package (`cmd/output`) owns process exit codes.
- Capability packages (`files`, `git`, `terminal`, `computer`) stay
  independent — they are not workspace internals. `workspace/worktree` and
  `workspace/watchers/fswatch` are single-owner packages under their owner.
- Edge adapters (`adapter/cloud`, `adapter/sqlite`, `adapter/relay`) and
  platform packages (`platform/config`, `platform/shellenv`,
  `platform/logging`, `platform/release`) have no Go files in their roots —
  the roots only classify children.

### Test filename and ownership rules (cli)
- A unit test uses the production-file stem; a use-case test uses the use-case
  name (`create_test.go`); a contract test uses the port name
  (`store_contract_test.go`); an integration test uses the flow name; test
  support uses `test_support_test.go`. No test file exceeds 500 lines — split
  by behavior.
- Test names never reference removed owners (`Manager`, `Dispatch`, `Handle`
  RPC prefixes). A test file maps to one behavior owner or one explicit flow;
  see `apps/cli/internal/test-ownership.md` for the per-file owner matrix.

## 8. Naming Conventions

### Universal (all languages)
- **Booleans** must be prefixed with `is`, `has`, `can`, `should`, or `did`.
  Bad: `loading`, `enabled`, `dirty`. Good: `isLoading`, `isEnabled`, `isDirty`.
- **Functions** are named with a verb: `getX`, `setX`, `buildX`, `resolveX`, `createX`,
  `parseX`, `normalizeX`. Do not name a function as a noun unless it is a constructor.
- **Event handlers** are prefixed with `handle` (e.g., `handleSubmit`, `handleTabClose`).
- **Async functions that perform network I/O** should not be named as if they are pure
  (e.g., use `fetchUser` or `loadUser`, not `getUser` if it hits the network).
- Generic names (`data`, `result`, `item`, `value`, `temp`, `info`, `record`, `obj`) are
  banned as variable names except inside trivial 2-line closures. Name the variable after
  what it represents in the domain.

### TypeScript-specific
- Types and interfaces: `PascalCase`.
- Enums and string union types: `PascalCase`. Members: `camelCase` for string unions,
  `UPPER_SNAKE_CASE` for numeric enums.
- Files: `camelCase.ts` for utilities/hooks/stores, `PascalCase.tsx` for React components.
- Constants exported at module level: `UPPER_SNAKE_CASE` for primitive values,
  `camelCase` for object constants (e.g., `DEFAULT_CONFIG`, `defaultTheme`).

### Go-specific
- Constants: `camelCase` for unexported, `PascalCase` for exported. `ALL_CAPS` is not
  used in Go.
- Test function: `TestFunctionName_Scenario` (e.g., `TestRegister_ReplacesExistingSession`).

### Terminology consistency
These concepts have one canonical name in this codebase. Use only the listed name:

| Concept | Correct name | Do not use |
|---|---|---|
| A git repository with app config | **project** | repo, repository (in TS/app code) |
| The local git worktree checkout | **workspace** | branch, worktree (in user-facing code) |
| The local filesystem path of a workspace | **worktreePath** | localPath, path, cwd |
| The currently signed-in user | **currentUser** / **actorUser** | user, me, self |
| Agent CLI tools | **agentKind** | agentType, agentName |

---

## 9. Error Handling

### TypeScript / JavaScript
- All errors thrown from services are typed classes extending a base error class.
  Never `throw new Error("some string")` from a service — create a typed subclass.
- `catch` blocks must not be empty. At minimum, log the error with context.
- `Promise` rejections must be handled. Do not leave `.catch()` off a `void` promise
  unless you have explicitly added a `// fire-and-forget` comment.
- Use `getErrorMessage(error)` from `errors/getErrorMessage.ts` to extract the message from
  an `unknown` catch value. Never write `error instanceof Error ? error.message : String(error)`.

### Go
- Errors are wrapped with `fmt.Errorf("context: %w", err)` — always `%w` for error values.
- Sentinel errors are defined with `var ErrXxx = errors.New(...)` and tested with
  `errors.Is`. Never compare error strings.
- Errors that contain dynamic data use typed structs implementing the `error` interface.
- Never swallow errors silently. If an error is intentionally ignored, comment why:
  ```go
  _ = conn.Close() // best-effort cleanup; error is irrelevant at this point
  ```

---

## 10. Testing

### What requires tests
- **All new service methods** in `api-service` must have at least one test.
- **All new pure functions** (helpers, domain logic, utilities) must have unit tests.
- **All new CLI command flows** that contain branching logic must have tests.
- **Bug fixes must include a regression test** that fails before the fix and passes after.

### What does not require tests
- Cobra command wiring (the `init()` / flag registration blocks).
- Simple passthrough getters with no logic.
- Generated code.

### Test rules
- Tests must assert **behaviour**, not implementation. Do not test private state directly.
- Do not test the happy path only. Every conditional branch should have a test case.
- Tests must be independent — no shared mutable state between tests.
- In Go: use table-driven tests (`[]struct{ name, input, want }`) for functions with
  multiple input variants.
- In TypeScript: use `vitest`. Mock only what crosses a system boundary (network, file
  system, time). Do not mock internal helpers.
- Test files live adjacent to the file they test: `foo.ts` → `foo.test.ts`.

### Test quality bar
A test that only verifies the function did not panic is not a test. Every assertion must
check a concrete output value or a specific side effect.

---

## 11. File Size and Splitting

### Hard limits
- **500 lines**: no source file should exceed this. If it does, it must be split.
- **300 lines**: a React component. If it exceeds this, extract sub-components or hooks.
- **150 lines**: a custom hook. If it exceeds this, split into focused hooks.
- **40 lines** (Go): a single function. If it exceeds this, extract named sub-functions.

### When to split a TypeScript file
- The file contains two or more exported symbols that are independently importable and
  have no dependency on each other.
- The file mixes type definitions with logic.
- The file has grown beyond its original single concern.

### When to split a Go file
- A `switch` statement has more than 10 cases with non-trivial case bodies.
- A struct has methods that belong to more than one concern.
- A function is longer than 40 lines.

### How to split
- New files in the same package (Go) or same directory (TS) do not create new import paths.
  This is the preferred first step.
- Extract a new package (Go) or directory (TS) only when the extracted unit is independently
  reusable by multiple consumers.
- Every split must preserve the existing public API exactly — no renaming of exported
  symbols as part of a structural split.

---

## 12. Performance Rules

### TypeScript / JavaScript
- Do not allocate objects or arrays inside a tight render loop or hot event handler.
  Define them outside or use `useMemo`.
- Do not call `JSON.stringify` / `JSON.parse` in a hot path. If serialisation is needed,
  measure first.
- Do not use `reflect` or deep-equality libraries (`lodash.isEqual`, `reflect.DeepEqual`
  in Go) in hot paths. Write typed field-by-field comparators instead.
- Virtualise long lists. Any list that could have more than 50 items must use
  `@tanstack/react-virtual`.

### Go
- **Goroutine-per-request** patterns (e.g., one goroutine per WebSocket message) require
  a semaphore. Unbounded goroutine spawning is a bug.
- **Subprocesses** (especially `git`, `gh`, `shell env` resolution) are expensive. Cache
  results with a TTL. Never spawn a subprocess to read static data (e.g., PATH resolution)
  on every call — cache with `sync.Once` or a TTL map.
- **Stale-while-revalidate** for blocking operations: if cached data exists (even if
  stale), return it immediately and refresh in the background. Never block a user-facing
  RPC call on a network operation when stale data is acceptable.
- `sync.Mutex` blocks all readers. Use `sync.RWMutex` for state that is read frequently
  and written rarely.
- Batch database or API operations when processing a list. Never issue one query per item
  in a loop.

### api-service (Cloudflare Workers + Neon — both serverless)

`api-service` runs on **Cloudflare Workers** and talks to **Neon** (serverless Postgres).
Both are serverless: a Worker isolate is created per request (or per concurrent burst) and
torn down after the response; Neon compute starts cold when the first connection arrives.
Every design decision must account for this.

#### No persistent in-process state

Module-scope variables (`let`, `const`, class instances at module level) **do not survive
between requests**. A new isolate starts with a fresh module graph on every request (or
after a period of inactivity). This means:

- **In-memory caches with a TTL do not work.** A cache populated in request N is not
  visible to request N+1 if it runs in a different isolate. Do not add module-scope cache
  variables expecting them to persist across requests.
- **The one safe use of module-scope state** is for values that are purely derived from
  the Worker's `env` bindings object, which is the same reference for the entire lifetime
  of a single isolate. `getServiceConfig` caches its result in a `WeakMap<object, ServiceConfig>`
  keyed on `c.env` — this works because `c.env` is stable within an isolate, and the
  `WeakMap` is GC-safe if the isolate is ever torn down.
- **Do not port Go/Node.js caching patterns to `api-service`.** Patterns like "module-scope
  `let cache = null`" or "module-scope `Map` with TTL" are standard in long-lived servers
  but broken in Workers. If cross-request caching is needed, use Cloudflare KV or Cache API.

#### Database connections — always via Hyperdrive in production

In production, Neon is reached through **Cloudflare Hyperdrive**, which terminates
the TCP connection inside Cloudflare's network and maintains a persistent pool on behalf
of the Worker. This is how the two serverless constraints are reconciled: Neon's compute
can stay warm because Hyperdrive holds the actual connections; Workers never hold a raw
connection themselves.

The connection path in `injectRequestContext` (`middlewares/context.ts`):

```
CF Worker request
  → hasHyperdriveBinding? yes (production)
      → createRequestDb(hyperdrive.connectionString)
        opens one pg.Client for this request, routed through Hyperdrive
        closed in the finally block after the response
  → hasHyperdriveBinding? no (local Bun dev)
      → getDb(DATABASE_URL)
        returns a pooled pg.Pool instance cached in module scope
```

Rules that follow from this:

- **`createRequestDb` is the production code path, not the exception.** The `getDb` pool
  path exists only for local development (no Hyperdrive binding). Do not treat it as the
  default.
- **Always close the request-scoped client in a `finally` block.** `injectRequestContext`
  already does this. If you introduce a new request-scoped client anywhere, the same
  pattern is mandatory — a leaked client holds a Hyperdrive slot and will eventually
  exhaust the pool.
- **Do not open additional connections inside a service method.** All DB access goes
  through the `db` instance injected at construction time. A service must never call
  `createRequestDb` or `getDb` directly.
- **Prefer `db.transaction(async (tx) => ...)` over multiple sequential writes.**
  A crash between two sequential `await db.update()` calls leaves the DB in a partial
  state. Wrap multi-step atomic writes in a transaction.
- **Neon auto-pauses idle compute.** The first query after a cold period has a connection
  latency spike (~100–500 ms). Design accordingly: do not assume sub-millisecond DB
  response times on the first query of a cold request.

#### Query discipline

- **`SELECT *` is banned.** Enumerate only the columns needed. Large text columns such as
  `prompt` (up to 4 096 chars) and `lastErrorMessage` cost real bandwidth to Neon and back.
  Fetching them just to perform an existence check is wasteful.
- **Never issue one query per item in a loop.** Use `Promise.all` to fan out independent
  queries, or restructure into a single query with `IN (...)` / `JOIN`.
- Independent queries within a single request must run concurrently with `Promise.all`,
  not `await`-ed in sequence.
- Service methods called on every protected endpoint (e.g., membership checks) must be
  as lean as possible — one query, no extra fetches.

#### External HTTP calls (QStash, relay metrics, OAuth providers)

- **Never loop over a list with sequential `await fetch(...)`** inside the loop.
  Use `Promise.all` with a concurrency limiter (semaphore) to bound simultaneous open
  connections.
- Workers have a per-request wall-clock limit. Long-running evaluators must use
  `Promise.race([work(), timeoutAfter(N)])` so a slow external service cannot cause the
  Worker to hit its CPU/wall-clock limit silently.
- Add a `console.warn` / `console.error` on any failed external HTTP call. An empty
  `catch {}` that silently swallows a failure makes relay downtime invisible.

---

## 13. What AI Agents Must Not Do

These rules exist to prevent common AI-assisted mistakes.

1. **Do not alter business logic while refactoring.** Refactor = structural change only.
   If the behaviour changes, it is a bug fix or feature, not a refactor.

2. **Do not remove or rename exported symbols without updating all import sites.**
   Search for all usages before removing anything exported.

3. **Do not create new files for single-use utilities.** A 3-line helper does not need
   its own file. Only extract to a shared file when there are 2+ consumers.

4. **Do not add `any` to fix a TypeScript error.** Understand the type and fix it
   correctly. If the correct type is complex, use `unknown` + a type guard.

5. **Do not swallow errors to make tests pass.** If a test fails, fix the code or the
   test — do not hide the error.

6. **Do not add a new dependency without checking if the functionality already exists**
   in the standard library, an existing dependency, or a small hand-written utility.

7. **Do not write tests that only test the happy path.** Every test file must include
   at least one error/edge-case scenario.

8. **Do not inline duplicate logic instead of calling the shared helper.** If
   `getErrorMessage`, `generateId`, `assertOrganizationMember`, or any other shared
   utility already exists, use it.

9. **Do not skip the layer contract.** A view must not call a store domain function
   directly. A handler must not query the database. A CLI command must not instantiate
   internal services that it does not own.

10. **Do not leave TODO comments without a linked issue or a concrete plan.** A TODO
    that describes a known deficiency without an action plan is noise.

11. **Do not port long-lived-server caching patterns to `api-service`.** Module-scope
    `let cache = null` or a `Map` with a TTL are correct patterns in Node.js or Go servers
    but **do not work** in Cloudflare Workers — each isolate starts fresh. If you find
    yourself adding a module-scope mutable variable to `api-service` to cache data across
    requests, stop and reconsider. Use Cloudflare KV, the Cache API, or restructure the
    query instead. The only safe module-scope cache is one keyed on `c.env` (a stable
    reference within a single isolate) via a `WeakMap`.

12. **Do not issue sequential `await` DB or HTTP calls in `api-service` when they are
    independent.** Sequential awaits in a serverless context consume wall-clock time that
    counts against the Worker's CPU budget. Use `Promise.all`.

---

## Appendix: Quick Reference

### TypeScript shared utilities
| Utility | Location | Use for |
|---|---|---|
| `generateId()` | `desktop/src/renderer/helpers/generateId.ts` | All UUID/random ID generation |
| `getErrorMessage(e)` | `desktop/src/renderer/errors/getErrorMessage.ts` | Extracting message from `unknown` catch value |

### api-service shared helpers
| Helper | Location | Use for |
|---|---|---|
| `assertOrganizationMember` | `api-service/src/services/shared/` | Auth check before any org-scoped mutation |
| `assertNodeOwnedByActor` | `api-service/src/services/shared/` | Auth check before node-scoped mutations |
| `nonEmptyStringSchema` | `api-service/src/validation/common.ts` | Any required string field in Zod schemas |

### Run commands
```bash
# TypeScript — from repo root or app directory
bun run typecheck        # tsc --noEmit
bun run lint             # biome check
bun run test             # vitest run (api-service) or vitest run (desktop)

# Go — from apps/cli or apps/relay
go build ./...
go test ./...
go vet ./...
```

### Token-usage domain (cli)
- `internal/tokenusage` is split into one-owner sub-packages (Phase 14):
  `collection` (periodic orchestration, scheduling timers, sync-to-API, cost
  backfill), `scanner` (provider parsing — codex/claude/opencode/pi/gemini),
  `ingestion` (source discovery + scan-input assembly), `attribution`
  (workspace/session ownership: CWD → workspace resolution + registry
  enrichment), `pricing` (model pricing catalog + cost estimation),
  `repository` (hourly-row persistence interface + record↔SQLite conversion),
  and `record` (the normalized `UsageRecord` leaf type).
- The collector coordinates but contains no provider parser; each provider
  scanner returns `[]record.UsageRecord` (never the db row type). Provider
  scanners do not access the database; attribution and pricing each have one
  owner. The `tokenusage` root package is a facade: `Service`,
  `NewCollectorWithRepository`.
- archtest enforces the sub-package boundaries (record/pricing/attribution are
  leaves; scanner must not import collection/ingestion/repository; the
  collector never imports provider parse code).

### Agent setup ownership (cli)
- `internal/agent/setup` is the single owner of agent installation, extension
  setup, and skill discovery (Phase 15). It is partitioned by concept:
  catalog (ListPiExtensions / ListPiAgents / ListSkills + EnumeratePiSkills
  discovery), installation (Install/Remove/Update extension + agent mutations
  + skill add/remove/update + managed-runtime sync — each takes an explicit
  target), and reconciliation (`GetInstalledState` compares desired state with
  installed state). Provider declarations (`defaultPiExtensionNames`,
  `piExtensionInstallSource`) live in `provider.go`, separate from execution.
- Discovery rules have one owner each: extension discovery = ListPiExtensions,
  skill discovery = EnumeratePiSkills, agent discovery = ListPiAgents. The
  reconcile state reuses the catalog's installed-state rule (package.json
  presence) instead of a second subprocess check.
- Setup code never imports rpc or daemon (param decoding lives in the node
  RPC services); no setup function forwards to another package — the
  hook-install forwarder was removed and callers use `setup/hooks` directly.

### Internal package taxonomy (cli, Phases 16–21)

Package names match their directory roles (Phase 21): `adapter/cloud` is
`package cloud`, `adapter/cloud/session` is `package session`
(`session.Session` owns cloud authentication state), `adapter/sqlite` is
`package sqlite`, `platform/logging` is `package logging`, and `events` is
`package eventbus`.

- Every top-level internal package has one documented role: composition
  (`app`), host/transport (`daemon`, `rpc`), application boundary
  (`node/*` vertical services), domain owner (`workspace`, `agent`,
  `tokenusage`, `memory`), capability owner (`files`, `git`, `terminal`,
  `computer`), edge adapter (`adapter/cloud`, `adapter/sqlite`,
  `adapter/relay`), or platform owner (`platform/config`,
  `platform/shellenv`, `platform/logging`, `platform/release`). The
  `adapter` and `platform` roots contain no Go files.
- Small packages live under their natural owner: `agent/kind` (shared
  vocabulary), `git/exec`, `node/id`, `node/context` (renderer context
  store), `workspace/worktree`, `workspace/watchers/fswatch`,
  `cmd/output` (CLI output + exit-code policy).
- Domain and capability owners return their own errors (`workspace.Error`,
  `files.Error`, `git.Error`, `worktree.Error`, `terminal.Error`,
  `computer.Error`) and never import `rpc`; `rpc.MapRPCError` maps domain
  errors to wire errors.
- `internal/app` is the only composition root and may import every concrete
  package; node services never import `internal/app` or `internal/daemon`.
- Workspace lifecycle operations (open/close/hydrate/health/persist) live in
  `node/workspace` (the workspace application service), not in the
  `workspace/application` domain package: they depend on the SQLite adapter
  and the cloud API client, and moving them into the application layer would
  leak db/api into `workspace/application`, breaking the
  `application -> domain + interfaces` contract.

