# Mobile Agent Guide

This file defines the default engineering rules for work inside
`apps/mobile`.

## Goal

Build a React Native mobile app with sane defaults for:

- maintainability
- native UX
- mobile-first performance
- clean boundaries with `apps/api-service`

When in doubt, optimize for a production-quality Android/iOS app first. Web
support is optional, not the primary constraint.

## Related docs

Read the right doc before large or cross-cutting changes:

| Topic | Doc |
| --- | --- |
| Current product scope and API boundary | [README.md](./README.md) |
| Shell IA (drawer + focus pane) | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Directory layout and layers | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Remote workspace/session runtime plan | [docs/remote-runtime-plan.md](./docs/remote-runtime-plan.md) |

## Rule precedence

This file is the primary implementation guide for code inside `apps/mobile`.

Rules:

- if a root-level monorepo guide conflicts with this file on frontend structure,
  routing, state ownership, providers, or feature boundaries, follow this file
- use the root monorepo guides for shared language/tooling conventions unless
  `apps/mobile` explicitly overrides them
- use [ARCHITECTURE.md](./ARCHITECTURE.md) as the source of truth for mobile IA
  and layer intent when this file gives a shorter operational rule

## Quick rules

- do not call `fetch` from routes or screens; use `src/lib/api` + feature `*.api.ts`
- do not store refresh tokens in AsyncStorage; use secure storage helpers
- user-visible strings go through `useAppLanguage().t()` and `src/features/i18n/copy.ts`
- prefer `EmptyState`, `ErrorState`, `LoadingView`, and `ScreenScaffold` for screen states
- new global providers belong in `src/providers/AppProviders.tsx`, not random screens
- read [README.md](./README.md) before adding endpoints outside the current mobile scope
- run `bun run typecheck` and `bun run lint` from `apps/mobile` before considering work done

## Default stack

Use these defaults unless the task explicitly requires otherwise:

- Expo SDK ~55 (managed workflow)
- React 19 + React Native 0.83
- TypeScript (strict, inherited from repo root)
- Expo Router for navigation
- `@tanstack/react-query` for server state
- secure key-value storage via `src/lib/storage/key-value-storage.ts` (SecureStore
  on native, `localStorage` on web)
- `tamagui` for the UI and styling system
- icons via `@tamagui/lucide-icons`

Do not switch to bare React Native or add custom native modules unless there is
an explicit requirement that Expo cannot satisfy.

## Monorepo alignment

This repository currently uses:

- `bun` workspaces
- `biome` for formatting and linting at the repo root
- strict TypeScript settings at the repo root

Rules:

- align new mobile package scripts with the root contributor workflow
- prefer `biome` over introducing a parallel formatter/linter stack by default
- inherit strict TypeScript behavior from the repo root unless mobile tooling
  requires a documented override
- use the `@/` path alias for imports from `src/`

Local validation from `apps/mobile`:

```bash
bun run typecheck
bun run lint
```

Run `bun run test:unit` when touching:

- pure state helpers
- route-state translation
- persistence adapters
- reducers or state machines
- auth bootstrap and restore flows
- command logic with branching behavior

If tests do not exist yet for a changed area, note the gap explicitly.

## Routing and app structure

Prefer Expo Router for new work.

Reasons:

- file-based routing reduces navigation boilerplate
- built-in deep linking is useful for auth and notifications
- route-based structure is easier for onboarding and AI agents

Keep route files thin. Put business logic in feature modules.

Recommended layout:

- `app/` — Expo Router routes and layouts
- `src/providers/` — app-wide provider composition (`AppProviders.tsx`)
- `src/features/auth/`, `shell/`, `organizations/`, `projects/`, `settings/`,
  `me/`, `i18n/`, `theme/`, `preferences/`, `workspaces/` (as needed)
- `src/components/ui/` — shared primitives (`EmptyState`, `ErrorState`, …)
- `src/components/screens/` — shared screen shells (`ScreenScaffold`)
- `src/lib/api/`, `config/`, `query/`, `storage/`, `theme/`, `utils/`

See [ARCHITECTURE.md](./ARCHITECTURE.md) for layer responsibilities.

Rules:

- route files compose screens and hooks; they should not contain heavy data or
  state logic
- feature modules own API hooks, transformers, local types, and screen logic
- shared UI primitives live under `src/components/ui`
- app-wide providers live in `src/providers/AppProviders.tsx` and root layouts
- cross-feature imports are allowed only through explicit public entry points
- a public entry point may be a feature `index.ts`, `*.api.ts`, `*.types.ts`,
  exported `queries/`, `commands/`, `state/`, `view-model/`, or exported
  screens/components
- do not deep-import another feature's private implementation files just because
  the path exists
- if another feature needs a stable capability that does not yet have a public
  entry point, add one or move the shared logic into `src/lib`

## App providers

Global provider wiring is centralized in `src/providers/AppProviders.tsx`.

Current order (outer → inner):

1. `GestureHandlerRootView`
2. `SafeAreaProvider`
3. `AppLanguageProvider`
4. `AppThemeProvider`
5. `QueryClientProvider`
6. `AuthProvider`

Rules:

- add new global providers here (or root `_layout.tsx`), not inside individual screens
- do not nest duplicate `QueryClientProvider` or `AuthProvider` instances in features
- root-level app side effects belong in app layouts or feature-owned coordinators, not
  inside presentational components

## Naming and file conventions

Use predictable names.

Rules:

- screen components: `XxxScreen.tsx`
- reusable UI components: `Xxx.tsx`
- hooks: `useXxx.ts`
- API functions: `xxx.api.ts`
- query hooks: `useXxxQuery.ts` and `useXxxMutation.ts`
- mappers/transformers: `xxx.mapper.ts`
- constants: `xxx.constants.ts`
- types local to one feature: `xxx.types.ts`

Architecture vocabulary rules:

- keep mobile-native presentation names for `Screen`, `Sheet`, and route
  wrappers
- use desktop-canonical concept names for workspace runtime ownership:
  `tab`, `pane`, `browser`, `selection`, `store`
- keep `src/features/*` as the top-level app taxonomy, but inside
  `features/shell` and `features/workspaces`, prefer a stable split between
  runtime authority (`state/` or `store/`), imperative orchestration
  (`commands/`), pure state rules (`domain/` / helpers), and presentation
  (`components/` / `views/`)
- if a module is only selecting or composing screen context, prefer names like
  `context`, `selectors`, or `helpers` instead of introducing a second
  `*ScreenModel` / `*ViewModel` layer without a clear ownership boundary
- if a file is the durable authority for feature state, prefer explicit `Store`
  naming where practical rather than hiding that role behind a generic hook name

Keep files focused.

Rules:

- if a screen file starts holding multiple subviews, extract them
- avoid files that mix component, hook, API client, and mapper logic together
- prefer one clear responsibility per file

Default split thresholds for mobile:

- React component: split before `300` lines
- custom hook: split before `150` lines
- command or state file: split before `250` lines unless it is a deliberate
  domain core with tests
- any source file: split before `500` lines

## Feature surface composition

Feature surfaces should be built from a small orchestration screen plus focused
subcomponents.

Rules:

- screen files should mostly orchestrate state, routing, and feature actions
- if a screen owns more than one clear visual section, extract those sections
  into feature-local components
- prefer feature-local component folders such as
  `src/features/<feature>/components/` for surfaces that are specific to one
  flow
- keep route files thin, keep screen files relatively thin, and move presentational
  structure into components before the screen becomes a monolith
- use a pattern like:
  `Screen -> feature components -> shared ui primitives`
- when a feature grows beyond `screens + hooks + components`, prefer explicit
  capability folders such as `state/`, `commands/`, `view-model/`, `browser/`,
  or `queries/` over leaving behavior flat at the feature root
- if a screen-level model exists, it should output screen-ready props and
  composition decisions; views should not need to simultaneously understand raw
  route state, runtime state, and command plumbing

Recommended examples:

- `AuthHero`
- `AuthEntryActions`
- `SettingsSection`
- `ShellNavSection`
- `ShellFocusPane`

Avoid:

- one screen file holding hero, modal, form, action list, and submission logic
  all together
- placing feature-specific surface components under `src/components/ui` when
  they are only used by one feature
- duplicating the same section structure across multiple screens instead of
  extracting a small component

## Desktop-inspired layering rules

Desktop is the strongest reference in this repo for keeping views thin and
boundaries explicit. Mobile should follow the same architectural intent even
when the implementation stays hook-first.

Rules:

- screen/view files render and compose; they should not become the long-term
  home for mutations, navigation side effects, storage coordination, or query
  invalidation
- `commands/` owns behavior:
  router writes, multi-step mutations, storage writes, cross-store/query
  coordination, and other imperative feature actions
- `state/` owns durable feature state shape, pure state helpers, route-state
  translation, persistence adapters, and reducers/state machines
- `view-model/` composes state + commands + queries into screen-ready data; it
  may orchestrate feature hooks, but it should not become a second command layer
- if a hook mostly triggers actions or side effects, it belongs in `commands/`,
  not a generic `hooks/` folder
- if a hook mostly derives state or composes feature context for rendering, it
  belongs in `state/` or `view-model/`
- prefer naming that reveals role, not React form alone; `useXxx` is not enough
  if the file is really a command or state module
- route/state types should come from one obvious owning module; do not let grab-bag
  helper files become the accidental source of shared feature types

Recommended shape for larger features:

- `screens/` or top-level screen entry
- `components/`
- `commands/`
- `state/`
- `view-model/`
- `queries/`
- feature-specific subdomains such as `browser/`, `preview/`, `settings/`

Avoid:

- one large hook that mixes state ownership, navigation, mutations, and render
  projection
- burying imperative behavior in a generic `hooks/` bucket when it is really a
  command layer
- pushing feature-specific styling or header semantics into shared scaffolds
  when they belong to a feature surface

## Styling boundary rules

Use a strict styling boundary so custom layout does not sprawl.

Rules:

- shared visual primitives belong in `src/components/ui`
- feature-specific layout belongs in feature-local components
- if a surface needs custom layout, prefer a local `StyleSheet` or a tightly
  scoped style object inside the owning component instead of scattering inline
  styles across the screen
- keep design tokens, theme, and app-wide configuration centralized
- read app metadata such as version from config/constants, not from hardcoded
  literals inside screens

For minimal entry/login flows:

- keep the top-level screen focused on state wiring and navigation
- move hero blocks, action groups, bottom sheets, and version/footer blocks
  into separate components
- do not keep dormant fields visible on the main surface when they can live in a
  modal or sheet

Avoid:

- large screens full of repeated `style={{ ... }}` blocks
- hardcoded app metadata like version strings inside screens
- mixing feature state logic and fine-grained layout code across the same
  150-300 line screen file

## State management

Separate server state from client state.

Use `@tanstack/react-query` for:

- API reads
- API mutations
- caching
- refetch and invalidation
- loading and error states

Do not use ad hoc `useEffect + fetch` patterns for normal API work.

Use React local state, context, or reducer for:

- temporary UI state
- local form state
- auth bootstrap state

Only introduce a client-state library if plain React state becomes clearly
insufficient.

Testing expectations for client state:

- pure state helpers require unit tests
- reducers and state machines require unit tests for each branch
- persistence encode/decode helpers require regression tests when changed
- route-state translation helpers require regression tests when changed

## Data fetching and API client rules

All backend access should go through one typed API layer.

Rules:

- do not call `fetch` directly from screens or route files
- create typed request helpers under `src/lib/api/`
- create feature-level API functions that wrap endpoints with typed input/output
- normalize backend response shapes before they spread through the UI
- keep query keys centralized and deterministic

Recommended pattern:

- `src/lib/api/client.ts`
- `src/lib/api/errors.ts`
- `src/lib/query/query-keys.ts`
- `src/features/<feature>/<feature>.api.ts`
- `src/features/<feature>/hooks/useXxxQuery.ts`

Query rules:

- every list/detail query must use a stable query key
- mutations must invalidate or update the exact affected keys
- do not use broad `invalidateQueries()` calls without a concrete key scope
- treat retries intentionally; do not blindly retry user mistakes like `400` or
  `403`
- do not override `staleTime` / `retry` per hook unless there is a documented reason;
  defaults live in `src/lib/query/query-client.ts`
- prefer explicit cache updates over optimistic UI unless list UX clearly needs it

Project defaults (`query-client.ts`):

- query `staleTime`: 30s
- query retry: skip 4xx; at most one retry for other failures
- mutation retry: disabled
- `refetchOnWindowFocus`: false (wire React Native `focusManager` when adding
  foreground refetch behavior; see TanStack Query React Native docs)

## Auth rules

Use mobile-native auth assumptions.

Rules:

- do not assume cookies are the primary auth mechanism
- persist access and refresh tokens via `session-storage` / `key-value-storage`
  (SecureStore on native)
- keep auth bootstrap explicit: load token, validate/refresh, then enter app
- use direct Google OAuth for installed apps as the primary mobile sign-in flow
- mobile owns its own OAuth callback and token exchange flow before normal
  refresh/revoke behavior begins

When implementing auth UX:

- show a splash/loading state while restoring tokens
- never render signed-in routes before auth bootstrap completes
- on sign-out, clear secure storage and reset navigation state

Auth expectations:

- implement token restore, refresh, revoke, and sign-out
- use Google OAuth for installed apps
- keep callback, PKCE, and token exchange flows explicit

## Navigation rules

Navigation should stay predictable and debuggable.

Rules:

- keep route params serializable and minimal
- pass IDs through navigation, not large object payloads
- derive screen data from query/hooks, not from navigation state copies
- use route groups and nested layouts intentionally; do not create deep route
  trees without product value
- modal flows should be explicit in route structure
- phase 1 should mount one authenticated shell before resource focus routes
- `Login` stays outside the authenticated shell
- `Settings` is a utility destination outside the resource tree
- the shell should expose organization, project, workspace, and terminal context
- the selected tree item and focus pane should remain synchronized
- every screen must have an explicit way to leave it

Shell structure follows [ARCHITECTURE.md](./ARCHITECTURE.md):

- two zones: collapsible navigation (drawer/tree) + focus pane for the selected object
- switch context through the tree, not by stacking many full-screen CRUD pushes
- `Login` and `Settings` are outside the resource tree
Avoid (navigation):

- pushing the same screen repeatedly due to missing replace/reset logic
- coupling business logic to back-button side effects
- hiding required state in navigation params instead of the typed data layer

## Overlays (sheet, modal, alert)

Pick one pattern per flow and stay consistent:

| Pattern | Use when |
| --- | --- |
| Tamagui `Sheet` | transient selectors and settings pickers (`SettingsSelectorSheet`) |
| Expo Router modal route | full-screen flow that needs a URL, deep link, or explicit back stack entry |
| `Alert` | destructive confirmation with minimal UI |

Rules:

- do not stack multiple sheets for the same task
- sheets own their own submit/error state; the parent screen wires open/close and callbacks
- prefer route modals over invisible navigation state for flows users can deep-link to

## API boundary

Treat `apps/api-service` as the source of truth for backend capabilities.

For the first mobile iteration, default to these backend domains:

- auth refresh/revoke
- current user (`/me`)
- language preference
- notification preference
- organizations
- projects
- workspaces under a project (list + close only — companion operations)

Do not build the mobile UX around these backend concepts by default:

- local nodes
- relay tokens
- local paths
- workspace **provisioning** or desktop-style workspace infrastructure

Those provisioning flows are desktop/CLI-oriented. Listing or closing an existing
workspace for a project is still a safer mobile boundary than exposing full
desktop-style provisioning.

Read [README.md](./README.md) before adding new API integrations outside the
current mobile scope.

## Internationalization rules

Internationalization is not optional for this app.

Implementation (single layer):

- copy tree: `src/features/i18n/copy.ts` (`en` / `zh`)
- runtime: `useAppLanguage()` from `AppLanguageProvider` → `t("feature.section.key")`
- persistence: `src/lib/storage/language-preference-storage.ts`
- some strings reuse desktop locale JSON via `desktopValue()` with a mobile fallback

Rules:

- all user-facing copy goes through `t()`; do not hardcode large strings in components
- add new keys to both `en` and `zh` in `copy.ts` using stable dotted keys
  (e.g. `settings.language.title`)
- when reusing desktop copy, always provide a fallback string in `copy.ts`
- date, time, and number formatting should use locale-aware helpers

Current product context:

- backend user language preference currently centers on `en` and `zh`
- mobile should preserve that assumption unless product scope changes
- changing `apps/desktop` locale files can affect mobile strings that use `desktopValue()`

Avoid:

- concatenating translated strings manually
- embedding locale-specific formatting rules inline in screens
- introducing a second i18n library without an explicit product decision

## Type safety rules

TypeScript should carry real meaning, not decorative types.

Rules:

- avoid `any`
- avoid `as` casts unless narrowing is genuinely impossible
- prefer deriving types from API contracts and schema validators
- use explicit nullable handling; do not hide `null` or `undefined`
- keep backend DTO types separate from UI view-model types when shapes differ

If runtime validation is needed:

- prefer a schema layer such as `zod` at the API boundary
- validate risky external payloads before they enter feature logic

## Permissions, privacy, and security

Mobile features often cross into OS-level privacy boundaries.

Rules:

- request permissions only when the feature actually needs them
- permission prompts must be preceded by clear in-app context when possible
- track every new permission in documentation before shipping it
- do not collect or persist sensitive user data without explicit product need
- secrets, tokens, and session artifacts must stay out of logs
- sanitize error reporting so tokens and personal data are not emitted

If adding native capabilities:

- document iOS and Android permission implications
- confirm Expo support before choosing a package
- keep privacy-sensitive integrations behind clear feature boundaries

## UI, Tamagui, and styling

**Tamagui** is the only UI and styling system — not an optional layer on top of
raw React Native views.

### Why this stack

- closer to a custom product shell than Material-first kits
- token-driven theming; works on React Native and web if needed later
- fits the drawer/tree/focus-pane shell ([ARCHITECTURE.md](./ARCHITECTURE.md))

Do not introduce `react-native-paper`, `NativeWind`, `gluestack-ui`, or other
full UI kits unless product direction explicitly changes.

### Primitives and composition

- build the shell and screens from Tamagui primitives first (`Text`, `Button`,
  `Input`, `Sheet`, …) before inventing custom equivalents
- reusable wrappers live in `src/components/ui/` and stay token-driven
- shell architecture drives UI structure, not one-off page templates
- screen files focus on layout and state composition
- React Native `View` / `ScrollView` are fine for shell layout, drawer, and
  focus-pane framing when simpler than forcing `Stack` / `XStack` / `YStack`
- do not force Tamagui stacks when typing, platform behavior, or maintainability
  suffers
- layout ownership (shared vs feature-local vs local `StyleSheet`) follows
  [Styling boundary rules](#styling-boundary-rules) above

### Theme and tokens

Single source of truth: `src/lib/theme/` and `tamagui.config.ts`.

- use **semantic** tokens (e.g. `color.background`) — not ad hoc screen color names
- define colors, spacing, radius, typography, elevation, and motion duration once
- avoid hardcoded hex in screens except during short-lived exploration
- keep dark mode explicit; do not rely on partial conditional styling
- around Tamagui components: prefer token-driven variants or small wrappers —
  no utility-class styling systems by default

### Interaction and platform

- use safe areas on every top-level screen (prefer `ScreenScaffold`)
- use `Pressable` or primitives that support proper pressed states
- respect platform differences; do not force pixel-identical web styling

### Avoid

- mixing multiple UI systems in the same shell
- Material/Paper visual assumptions
- a large parallel utility/style layer on top of Tamagui
- unnecessary wrappers whose only purpose is avoiding React Native `View`
- one-off colors, spacing, or radius scattered across screens

## Motion and animation

Animation should support comprehension, not decorate weak structure.

Rules:

- prefer simple transitions that reinforce screen changes and loading states
- avoid heavy continuous animation on data-dense screens
- loading animations should not obscure actual loading/error information
- honor reduced motion expectations where feasible

Do not add animation libraries by default unless the product or interaction
quality clearly requires them.

## Assets, icons, and images

Asset handling should stay consistent and mobile-friendly.

Rules:

- use `@tamagui/lucide-icons` as the default icon set; do not mix ad hoc icon
  libraries without documenting the exception
- optimize large raster assets before adding them
- do not place oversized marketing-style images into core product lists
- remote images must handle loading, failure, and sizing explicitly
- avatar and thumbnail components should have fallback states

Prefer:

- reusable image wrappers for common patterns
- theme-aware icon usage instead of one-off color overrides

## Shared screen primitives

Reuse app-level building blocks before inventing per-feature variants:

| Component | Location | Purpose |
| --- | --- | --- |
| `ScreenScaffold` | `src/components/screens/` | safe area, title, back affordance |
| `LoadingView` | `src/components/ui/` | loading state |
| `EmptyState` | `src/components/ui/` | empty collections |
| `ErrorState` | `src/components/ui/` | recoverable errors (retry action) |

Rules:

- new screens should compose these primitives for standard states
- extend under `src/components/ui/` only when the pattern is reused across features

## Screen design

Every screen should have these states when relevant:

- loading
- empty
- error
- refreshing
- success

Design for thumb use and small screens first.

Rules:

- primary actions must be reachable on a phone
- avoid dense desktop-style layouts
- avoid hiding essential actions behind hover-only patterns
- forms must handle keyboard overlap cleanly
- destructive actions must use confirmation

## Forms and validation

Forms should not become ad hoc state machines.

Rules:

- use one consistent form approach across the app
- validate required fields before submit
- render inline field errors where possible
- disable duplicate submits while mutation is in flight
- keep server error messaging separate from field validation errors
- extract non-trivial form state into feature-local modules (e.g.
  `src/features/projects/project-form.ts`) instead of bloating screen files

If forms grow beyond trivial state:

- use a dedicated form library consistently rather than inventing a new local
  pattern on each screen (pick one library project-wide before adopting it)

## Lists and performance

Use mobile list primitives correctly.

Rules:

- use `FlatList` or `SectionList` for long collections
- do not render long feeds with `ScrollView`
- provide stable keys
- use `getItemLayout` when row height is fixed and list size is large
- keep list rows visually simple and cheap to render
- avoid large unoptimized images in scrolling lists

## Accessibility

Accessibility is part of the default quality bar.

Rules:

- every tappable control must have a clear label or accessible text
- icons-only buttons need accessibility labels
- text contrast must be acceptable in light and dark themes
- touch targets should be comfortably tappable
- loading and error states should be understandable to assistive technologies

Do not ship screens that only work well for visual pointer-based interaction.

## Notifications and background behavior

Notifications need explicit product and technical boundaries.

Rules:

- do not assume desktop notification semantics transfer directly to mobile
- mobile push/local notification behavior must be modeled separately when needed
- background/foreground transitions must not corrupt auth or query state
- notification-driven navigation should go through one routing entry path

If push notifications are added:

- document permission flow
- document token registration lifecycle
- document deep link targets opened from notifications

## Offline and network behavior

Mobile network conditions are unstable by default.

Rules:

- handle reconnect and refetch intentionally
- when adding foreground/background refetch, wire TanStack Query
  `focusManager` / `onlineManager` for React Native in one place (not per screen)
- avoid assuming a request will finish while the app stays foregrounded
- show retry actions on user-facing failures (`ErrorState` + mutation/query retry)

Do not build UX that blocks the whole app on one slow request unless the screen
 genuinely cannot render without it.

## Platform-specific code

Platform differences belong in `src/lib/`, not in screens.

Rules:

- use `Platform.OS` and web fallbacks inside storage, config, or API helpers
- screens should not branch on platform for persistence or auth
- document any iOS/Android-only UX in the feature or permission docs

## Feature flag and rollout rules

Risky or incomplete mobile features should be easy to gate.

Rules:

- put experimental behavior behind one feature-flag layer
- do not scatter raw flag checks across many components
- flags should be named by product capability, not by temporary implementation
- removing stale flags is required follow-up work, not optional cleanup

## Error handling

Errors need one consistent path from API to UI.

Rules:

- separate transport errors, auth errors, permission errors, and validation
  errors
- map backend errors into user-facing messages intentionally
- do not expose raw backend error payloads directly in the UI
- auth expiry should trigger a controlled refresh or sign-out path
- unexpected errors should still produce a recoverable UI state

## Storage

Use the right storage for the right data.

Rules:

- read/write persisted strings through `src/lib/storage/key-value-storage.ts`
  (SecureStore on native, `localStorage` on web) — do not call SecureStore directly
  from feature code
- session tokens use `src/lib/storage/session-storage.ts`
- theme and language preferences use their dedicated storage modules
- do not store large blobs in secure storage
- use a non-secure cache or database only for data that is safe to persist
- if offline structured data becomes important, evaluate `expo-sqlite`

Avoid:

- `AsyncStorage` for tokens or secrets
- scattering storage keys as string literals; centralize keys next to the storage module

## Environment and configuration

Configuration must stay explicit.

Rules:

- keep runtime config access in one place
- do not scatter `process.env` reads throughout the app
- document required env vars for local development
- separate production-safe public config from secrets

If environment-specific behavior exists:

- centralize it behind config helpers
- do not branch on environment strings throughout screen code

## Dependency discipline

Prefer fewer, better-integrated dependencies.

Rules:

- before adding a package, check Expo compatibility first
- prefer libraries with active React Native or Expo support
- prefer copy-paste components over opaque UI black boxes when customization is
  likely
- do not add a dependency that duplicates an existing one
- prefer dependencies with clear Expo compatibility and recent maintenance

Before adding a dependency, answer:

- does Expo support it cleanly
- does it duplicate an existing package
- is it solving product complexity or just coding convenience
- who owns the abstraction if the package stops fitting

## Documentation and code comments

Documentation should reduce future ambiguity, not narrate obvious code.

Rules:

- exported non-trivial utilities and hooks should have succinct doc comments
- when a mobile constraint is surprising, explain why in code near the boundary
- update mobile docs when adding new architectural patterns or permissions
- avoid decorative comments that merely restate the code

## Observability

Add instrumentation intentionally when the product starts needing it.

Rules:

- navigation events, auth failures, and important mutations should be easy to
  instrument
- if analytics is added, wrap it behind one module interface
- if crash reporting is added, initialize it centrally
- do not sprinkle vendor SDK calls through screen components

## Testing and quality

Minimum expectations:

- type-safe code
- basic screen-level sanity
- explicit loading/error states
- no obvious navigation dead ends
- deterministic API and query behavior for core flows
- `bun run typecheck` and `bun run lint` pass from `apps/mobile`

When tests are added (Vitest):

- colocate tests as `*.test.ts` / `*.test.tsx` next to the unit under test
- test hooks, mappers, and API helpers before snapshot-heavy component tests
- avoid brittle snapshots for large screens
- prefer behavior assertions over implementation-detail assertions
- cover auth bootstrap, route protection, and critical mutations first

## Upgrade and migration discipline

React Native and Expo upgrades can break quietly if done casually.

Rules:

- prefer incremental version upgrades over large stacked jumps
- document breaking library changes that affect app patterns
- do not rewrite whole subsystems during routine package upgrades
- validate navigation, auth, theming, and core lists after framework upgrades

## Definition of done

A mobile change is not done until:

- `bun run typecheck` and `bun run lint` pass in `apps/mobile`
- types are sound
- loading, empty, error, and success states exist where relevant (prefer shared primitives)
- Tamagui theme/token usage is consistent
- API calls go through the typed API/query layer
- no desktop-only backend concepts leaked into mobile-first screens unless
  explicitly intended
- navigation entry and exit paths are valid
- obvious accessibility issues are handled
- any new dependency is justified by the chosen stack
- any new permission, deep link, or background behavior is documented
- new user-facing strings added to `copy.ts` (`en` + `zh`) and accessed via `t()`

## What Codex should avoid

- introducing desktop-only concepts into core mobile flows
- building around cookie-only auth assumptions
- adding native modules without checking Expo support
- mixing multiple navigation systems
- mixing multiple UI kits
- replacing standard Tamagui primitives with custom ones without a clear
  product reason
- putting API calls directly inside route components without a reusable hook
- storing refresh tokens in plain async storage
- spreading raw backend DTOs across UI code without mapping or normalization
- threading permission, notification, or feature-flag logic ad hoc through
  unrelated components
- hardcoding user-visible strings instead of `t()` and `copy.ts`
- importing another feature's internal files (only use public hooks/api/types)

## Current implementation snapshot

Last updated: 2026-05-16. Prefer code over this list when they diverge.

Implemented features:

- auth: token restore, refresh, revoke, direct Google OAuth
- shell: drawer/tree + focus pane (`ARCHITECTURE.md`, `src/features/shell/`)
- organizations, projects, workspaces (list/close)
- settings: profile, language, theme, notifications, session
- i18n (`en`/`zh`), theme (light/dark/system)

Route groups:

- `app/(public)/` — login
- `app/(app)/` — authenticated shell, orgs, projects, settings

## Stack recommendation (phase 1)

For new work in the current phase, prefer:

- Expo app (SDK ~55) + Expo Router
- TanStack Query + centralized `query-client.ts`
- secure storage via `key-value-storage.ts` / `session-storage.ts`
- Tamagui + Lucide icons
- `expo-auth-session` for first-time native OAuth
- additional UI kits (`react-native-paper`, NativeWind, etc.)

## Reference material reviewed

These sources were reviewed when setting this guide (initial pass 2026-05-12):

- Expo Router intro: https://docs.expo.dev/router/introduction/
- Expo Router auth: https://docs.expo.dev/router/advanced/authentication/
- Expo auth overview: https://docs.expo.dev/develop/authentication/
- Expo AuthSession: https://docs.expo.dev/versions/latest/sdk/auth-session/
- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- TanStack Query for React Native: https://tanstack.com/query/latest/docs/framework/react/react-native
- React Native FlatList optimization: https://reactnative.dev/docs/0.74/optimizing-flatlist-configuration
- React Navigation auth flow: https://reactnavigation.org/docs/auth-flow/
- Tamagui intro: https://tamagui.dev/docs/intro/introduction
- Tamagui installation: https://tamagui.dev/docs/intro/installation
