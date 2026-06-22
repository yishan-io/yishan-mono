# Mobile Architecture

Last updated: 2026-05-17

## Goal

Define the target architecture for `apps/mobile` before scaffolding begins, so
implementation work stays consistent across agents and execution passes.

This architecture assumes:

- Expo-managed React Native app
- Expo Router
- Tamagui
- TanStack Query
- `apps/api-service` as the primary backend

## Top-level principles

- mobile-first UX, not desktop concepts adapted downward
- thin routes, feature-owned logic
- typed API boundary
- centralized theme and providers
- predictable file layout
- backend DTOs do not leak directly into the UI layer
- shell-first IA, not page-by-page CRUD navigation

## Vocabulary alignment

Mobile does not need to copy desktop's visual structure, but it should reuse
desktop's architectural vocabulary for core workspace concepts.

Desktop-canonical concepts:

- `tab`
- `pane`
- `browser`
- `selection`
- `store`

Rules:

- when mobile models workspace focus, tab restore, pane layout, browser tabs,
  or selection ownership, prefer the same concept names and ownership
  boundaries as `apps/desktop`
- do not invent a second mobile-only term for a desktop-canonical concept
  unless the mobile concept is materially different

Mobile-specific presentation concepts:

- `Screen`
- `Sheet`
- Expo Router route composition
- mobile top bar / drawer / gesture surfaces

Rules:

- these can keep mobile-native naming and composition
- UI shape may differ from desktop, but state ownership and concept boundaries
  should still map back to desktop

## Shell and workspaces runtime shape

Top-level `apps/mobile/src/` keeps the mobile-oriented `features/*` taxonomy.
We do not mechanically flatten mobile into desktop's renderer directory layout.

However, `features/shell` and `features/workspaces` should internally converge
toward the same runtime semantics used by `apps/desktop`.

Recommended long-term inner structure for those features:

- `store/` or `state/` for durable runtime authority
- `commands/` for imperative orchestration and route writes
- `domain/` or pure helper modules for state rules
- `views/` / `components/` for presentation
- `adapters/` / route / persistence hooks for external inputs

Rules:

- `selection`, `tab`, `pane`, `browser`, and terminal-session ownership should
  match desktop semantics even when the mobile UI differs
- route params, persistence, notification restore, and browser inputs are
  adapter concerns; they are not the durable runtime authority
- screen-level composition may stay mobile-specific, but it should consume
  prepared runtime state instead of re-deriving ownership rules inside views
- mobile file opens from the browser are treated like a durable open tab
  directly, but they still must go through the same tab/pane mutation path as
  desktop-style runtime state

## Current shell model

The authenticated app is organized around one shell, not a stack of unrelated
CRUD screens.

Top-level app states:

1. `Login`
2. `App Shell`
3. `Settings`

`Login` stays outside the authenticated shell.

`Settings` is a separate full-screen utility route. It is not part of the
resource tree and not a right-side pane.

The shell itself has two zones:

1. a collapsible drawer / navigation surface
2. a focus surface for the selected terminal

Current drawer responsibilities:

- org selection
- node selection
- projects tree
- settings entry

Current focus responsibilities:

- show the selected terminal
- host terminal output
- host the composer

## Current resource model

Current mobile terminology should follow backend reality:

- `project`
- `workspace` = one project on one node
- `terminal` = one remote terminal on one workspace

Important relationship rules:

- `project` belongs to an organization
- `node` belongs to or is usable within an organization
- `workspace` belongs to both a `project` and a `node`
- `terminal` belongs to one `workspace`

This means node filtering should affect:

- visible workspaces
- visible terminals

It should not imply that projects themselves are node-owned.

## Current execution reality

Today mobile does not yet execute real workspace or terminal operations.

What mobile currently owns:

- shell selection state
- org/node filtering state
- local persisted recent-terminal summaries
- focus-surface presentation

What mobile does not yet own:

- opening a real workspace runtime on a node
- opening a real terminal on a workspace
- terminal, file, or git control on a node
- node presence / aliveness

Target rule:

- mobile should not invent a separate terminal engine
- real execution should happen on the selected node through relay + daemon
- mobile should become a remote client for:
  - `open workspace`
  - `open terminal`
  - `send command`
  - `receive output stream`
  - later terminal / file / git actions

## Proposed directory layout

```text
apps/mobile/
  app/
    _layout.tsx
    (public)/
      index.tsx
    (app)/
      _layout.tsx
      index.tsx
      shell/
      index.tsx
      organizations/
        [orgId]/
          index.tsx
          projects/
            [projectId].tsx
      settings/
        index.tsx
  src/
    components/
      screens/
      ui/
    features/
      auth/
      shell/
      organizations/
      projects/
      settings/
    lib/
      api/
      auth/
      config/
      query/
      storage/
      theme/
      utils/
    providers/
```

## Layer responsibilities

### `app/`

Owns:

- route structure
- route groups
- screen composition
- route-level guards

Does not own:

- direct backend calls
- heavy data transforms
- theme definitions
- reusable business logic

### `src/features/*`

Owns:

- feature-specific API wrappers
- query hooks and mutation hooks
- screen containers
- feature-local types
- DTO to view-model mapping

Does not own:

- app-wide providers
- global theming
- cross-feature utilities

### `src/components/ui`

Owns:

- reusable UI wrappers around Tamagui primitives
- app-specific design-system primitives
- low-level presentational building blocks

Examples:

- `AppButton`
- `AppTextField`
- `EmptyState`
- `ErrorState`
- `ScreenScaffold`

### `src/components/screens`

Owns:

- shared screen shells or layouts reused by multiple features

Examples:

- `AppScreen`
- `AuthScreenLayout`
- `ListScreenLayout`

### `src/lib/api`

Owns:

- HTTP client setup
- auth header injection
- request/response parsing
- API error mapping
- base DTO types and runtime validation helpers

### `src/lib/query`

Owns:

- query client creation
- focus/online integration for React Native
- query key factories

### `src/lib/storage`

Owns:

- secure token storage
- non-secure persisted preferences if needed

### `src/lib/theme`

Owns:

- Tamagui theme
- design tokens
- theme helpers

### `src/providers`

Owns:

- app-wide provider composition

Examples:

- `AppProviders`
- `TamaguiProvider`
- `QueryProvider`
- `AuthProvider`

### `src/features/shell`

Owns:

- navigation tree composition
- recent-items model
- expanded/collapsed branch state
- selected-item state
- drawer/rail visibility state
- focus-pane routing helpers

## Route strategy

Use route groups to separate auth states.

Recommended structure:

- `(public)` for sign-in and auth recovery flows
- `(app)` for authenticated screens

Phase-1 route map:

- `/(public)` -> direct Google sign-in
- `/(app)/shell` -> authenticated shell root
- `/(app)/organizations/[orgId]` -> organization-scoped focus route
- `/(app)/organizations/[orgId]/projects/[projectId]` -> repo/project focus route
- `/(app)/settings` -> utility settings screen

Rules:

- auth gating happens at layout level, not duplicated on every route
- root layout mounts providers once
- feature routes should load minimal route code and delegate screen logic into
  `src/features`
- authenticated routes should mount one app shell before resource focus content
- shell navigation state is part of the UI architecture, not an incidental
  detail
- settings should remain outside the org/repo/workspace tree
- the selected tree node and the focus pane should stay in sync
- `Recent` is a first-class shell section, not a secondary afterthought

## Provider stack

Recommended provider order near the app root:

1. safe area provider
2. paper theme provider
3. query client provider
4. auth/session bootstrap provider
5. optional portal/gesture providers as required

Rules:

- keep provider creation centralized
- do not create feature-local query clients or theme providers
- do not mount duplicate portal systems casually

## API integration pattern

Recommended per-feature structure:

```text
src/features/organizations/
  organizations.api.ts
  organizations.mapper.ts
  organizations.types.ts
  hooks/
    useOrganizationsQuery.ts
    useCreateOrganizationMutation.ts
  screens/
    OrganizationsScreen.tsx
```

Pattern:

1. `*.api.ts` talks to the typed API client.
2. `*.mapper.ts` converts DTOs into app-facing view models.
3. query hooks expose feature-friendly data.
4. screen components render from hook output.

Avoid:

- mapping raw API responses inline inside JSX
- calling `fetch` from screens
- mixing mutation code directly into button handlers without a hook layer

## Auth architecture

Target auth flow:

1. app starts
2. bootstrap reads tokens from secure storage
3. if access token is stale but refresh token exists, refresh
4. if refresh succeeds, enter authenticated route group
5. if refresh fails, clear tokens and enter public route group

Rules:

- treat auth bootstrap as a first-class state machine
- signed-in rendering must wait until bootstrap resolves
- sign-out clears secure storage and resets app auth state
- login UI stays outside the authenticated shell entirely

Current backend caveat:

- native-friendly OAuth completion still needs backend support work

## App shell architecture

Implementation expectations:

- the authenticated area mounts one `ShellScreen` or equivalent shell container
- the shell owns the drawer navigation zone and the focus zone
- shell state is local UI state, not server state
- terminal content in the focus zone is currently fed by local/mock state and
  should later be replaced by a relay-backed runtime stream
- settings remains a dedicated utility route/screen

Minimum shell state:

- `selection`
- `foldedProjectIds`
- `foldedWorkspaceIds`
- `recentTerminals`
- `selectedNodeIdByOrganization`
- `isNavOpen`

Recommended shell feature structure:

```text
src/features/shell/
  commands/
  components/
  hooks/
  screens/
  state/
  view-model/
  components/
    ShellDrawer.tsx
    RepositoriesTab.tsx
    ShellFocusPane.tsx
```

## Theme architecture

Use one app theme built on top of Tamagui tokens and themes.

Recommended files:

- `src/lib/theme/tokens.ts`
- `src/lib/theme/tamagui.config.ts`
- `src/lib/theme/index.ts`

Rules:

- Tamagui theme/tokens are the source of truth
- local wrappers in `src/components/ui` consume tokens and theme values, not
  raw hardcoded values
- screen components should rarely define colors directly

## Screen composition pattern

Recommended structure for a screen:

1. route file imports one screen container
2. screen container calls one or more feature hooks
3. presentational pieces live in local components or shared UI primitives
4. loading/empty/error/success states are explicit

Example split:

- `app/(app)/organizations/index.tsx`
- `src/features/organizations/screens/OrganizationsScreen.tsx`
- `src/features/organizations/hooks/useOrganizationsQuery.ts`

## Data model pattern

Keep these layers distinct:

- transport DTO
- feature domain/view model
- form input model

Do not assume one shape fits all three.

Example:

- backend org payload includes nested members
- list screen may only need `id`, `name`, `memberCount`, `isOwner`
- edit form may only care about `name`

## Shared UI primitives to create early

These should exist early because they reduce repeated decisions:

- `ScreenScaffold`
- `LoadingView`
- `EmptyState`
- `ErrorState`
- `SectionHeader`
- `AppTextField`
- `AppButton`
- `AppListItem`
- `ConfirmDialog`

## Not part of the first mobile architecture

Do not center the first architecture around:

- node registration
- relay tokens
- local filesystem paths
- a mobile-owned terminal runtime

Desktop/node execution concepts should enter mobile only when they are exposed
as productized remote capabilities such as:

- `open workspace`
- `open terminal`
- `open terminal`
- `open file`
- `run git action`

Until then, those remain backend/desktop concerns rather than mobile UI-owned
logic.
