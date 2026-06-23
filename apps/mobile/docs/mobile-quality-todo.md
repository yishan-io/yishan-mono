# Mobile Quality Improvement Todo

Last updated: 2026-06-16

## Current Scores

- Architecture direction: `7.5 / 10`
- Shell subsystem: `7 / 10`
- Overall mobile quality: `6 / 10`

## Goal

Turn `apps/mobile` into a codebase that is:

- structurally consistent
- easy to read feature-by-feature
- safe to extend without hidden coupling
- harder to regress in state-heavy flows

This is not only a review list. It is a governance tree.

Role of this file:

- this is the architecture and execution source of truth
- it owns target shapes, priorities, dependencies, and actionable leaf tasks
- it replaces the need for a separate `map` document

## How To Use This File

This document has four levels:

1. top-level architecture area
2. subsystem
3. target architecture shape
4. executable leaf todo

Each leaf todo must have:

- `Action`: what kind of work this is
- `Priority`: `P1`, `P2`, or `P3`
- `Depends on`: what must be settled first
- `Unlocks`: what becomes safer or easier after it
- `Done when`: concrete acceptance condition

Action legend:

- `review`: inspect and decide, no code change required unless issue found
- `refactor`: restructure existing code without changing product behavior
- `extract`: split a mixed file/module into narrower pieces
- `delete`: remove legacy code or dead branches
- `test`: add or extend automated coverage
- `document`: record module contract, owner, or entry-point rule

Priority legend:

- `P1`: highest leverage, architecture-shaping, or high regression risk
- `P2`: important cleanup that improves maintainability and local clarity
- `P3`: useful but can wait until core flows are stable

## Global Quality Gates

1. No cross-feature deep import into another feature's private files.
2. No route or screen should own routing, persistence, and remote mutation orchestration at the same time.
3. No command or state file over `250` lines unless it is a deliberate domain core with tests and clear submodules.
4. Touched state helpers, reducers, state machines, persistence adapters, and route-state translators must have tests or an explicit test gap note.
5. Every completed branch of work must update [mobile-quality-checklist.md](./mobile-quality-checklist.md).
6. Every completed branch of work must pass:
   - `bun run typecheck`
   - `bun run lint`

## 1. Routing And App Entry

### 1.1 Target Architecture Shape

Routes should be thin composition files only.

- `app/**` decides route structure and guards
- feature screens own screen composition
- feature commands own imperative behavior
- route files never become hidden business modules

### 1.2 Route Tree

- [x] Root entry and root layout stay structural only.
  Action: `review`
  Priority: `P1`
  Files: `app/index.tsx`, `app/_layout.tsx`
  Depends on: none
  Unlocks: clearer app bootstrap ownership
  Done when: root route files contain no feature restore logic, no fetch, no mutation orchestration.

- [x] Public route group owns only public-page composition.
  Action: `review`
  Priority: `P2`
  Files: `app/(public)/_layout.tsx`, `app/(public)/index.tsx`
  Depends on: none
  Unlocks: auth feature cleanup without route confusion
  Done when: login flow logic is fully feature-owned and public routes are thin.

- [x] Auth callback routes collapse to one explicit callback model.
  Action: `review -> refactor -> delete`
  Priority: `P1`
  Files: `app/auth/callback.tsx`, `app/oauth/google/callback.tsx`
  Depends on: auth OAuth chain review
  Unlocks: safer auth restore and less callback duplication
  Done when: callback entry responsibilities are non-overlapping and any fallback path is either removed or explicitly justified.

- [x] Authenticated route group owns guard framing, not shell state.
  Action: `review`
  Priority: `P1`
  Files: `app/(app)/_layout.tsx`, `app/(app)/index.tsx`
  Depends on: none
  Unlocks: shell root cleanup
  Done when: authenticated route files do not own shell commands, persistence, or restore behavior.

- [x] Shell subroutes remain route-param adapters only.
  Action: `review -> document`
  Priority: `P1`
  Files: `app/(app)/shell/index.tsx`, `app/(app)/shell/files.tsx`
  Depends on: shell route-state review
  Unlocks: stable shell route/state boundary
  Done when: browser/pane state ownership is feature-local and route files only map params to screen inputs.

- [x] Profile, settings, and organizations routes remain page mounting points only.
  Action: `review`
  Priority: `P2`
  Files: `app/(app)/profile/**`, `app/(app)/settings/**`, `app/(app)/organizations/**`
  Depends on: respective feature reviews
  Unlocks: page-level navigation consistency
  Done when: these routes do not carry modal-era state or feature-side effects.

## 2. Providers And Global Runtime

### 2.1 Target Architecture Shape

Global providers should only inject global runtime and app-wide state.

- `src/providers/**` owns composition
- feature restore logic stays feature-owned
- startup side effects have one owner each
- no provider becomes a cross-feature god object

### 2.2 Provider Composition

- [x] `AppProviders` is the single provider composition root.
  Action: `review -> document`
  Priority: `P1`
  Files: `src/providers/AppProviders.tsx`
  Depends on: none
  Unlocks: predictable provider order and easier onboarding
  Done when: provider composition is centralized and duplicate provider setup does not exist elsewhere.

- [x] Auth provider owns auth runtime only.
  Action: `review -> refactor`
  Priority: `P1`
  Files: `src/providers/AuthProvider.tsx`, auth runtime hooks
  Depends on: auth feature review
  Unlocks: clean auth/session boundaries
  Done when: provider does not also act as me bootstrap owner, shell coordinator, or route command layer.

- [x] Theme and language provider ownership is singular and obvious.
  Action: `review -> delete`
  Priority: `P2`
  Files: `src/providers/AppThemeProvider.tsx`, `src/features/theme/AppThemeProvider.tsx`, `src/providers/AppLanguageProvider.tsx`, `src/features/i18n/AppLanguageProvider.tsx`
  Depends on: theme/i18n review
  Unlocks: less provider duplication and easier developer discovery
  Done when: there is one clear theme provider entry and one clear language provider entry.

- [x] Notification runtime provider stays a provider, not a mixed runtime/controller/UI module.
  Action: `review`
  Priority: `P2`
  Files: `src/providers/NotificationRuntimeProvider.tsx`
  Depends on: notifications runtime review
  Unlocks: simpler notifications runtime cleanup
  Done when: provider injects and composes, but does not absorb permission, banner, and event handling responsibilities.

### 2.3 Startup Side Effects

- [x] Cold-start restore ownership is mapped and unique.
  Action: `review -> document`
  Priority: `P1`
  Files: providers, auth restore hooks, shell restore hooks, preference storage
  Depends on: auth and shell state review
  Unlocks: safer startup changes and fewer hidden race conditions
  Done when: auth restore, shell restore, language restore, and theme restore each have one obvious owner.

- [x] Debug and env access stays infrastructure-owned.
  Action: `review`
  Priority: `P3`
  Files: `src/lib/debug/mobileDebug.ts`, `src/lib/config/env.ts`, `src/lib/config/app.ts`
  Depends on: none
  Unlocks: cleaner production code paths
  Done when: feature code does not inline env branching or debug wiring.

## 3. Shared Platform Libraries

### 3.1 Target Architecture Shape

Shared libraries should be boring and predictable.

- `src/lib/api/**` owns HTTP concerns
- `src/lib/query/**` owns query client and shared key policy
- `src/lib/storage/**` owns persistence IO and formats
- `src/lib/navigation/**` owns reusable routing helpers
- `src/lib/theme/**` owns shared theme tokens and theme entry points

### 3.2 API And Query

- [x] API client is the only place that owns transport defaults.
  Action: `review -> document`
  Priority: `P1`
  Files: `src/lib/api/client.ts`
  Depends on: none
  Unlocks: simpler feature API wrappers
  Done when: features do not recreate header, base URL, or response parsing policy.

- [x] API error mapping is unified across features.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `src/lib/api/errors.ts`, feature `*.api.ts`
  Depends on: API wrapper review
  Unlocks: more predictable error surfaces in UI
  Done when: feature APIs do not each invent ad hoc API error translation.

- [x] Query client lifecycle is global and query key policy is consistent.
  Action: `review -> document`
  Priority: `P2`
  Files: `src/lib/query/query-client.ts`, `src/lib/query/query-keys.ts`, feature `queries/**`
  Depends on: none
  Unlocks: stable cache behavior and easier query reviews
  Done when: no feature re-creates query clients and query-key ownership is easy to find.

### 3.3 Storage

- [x] Key-value storage remains the shared low-level storage boundary.
  Action: `review`
  Priority: `P2`
  Files: `src/lib/storage/key-value-storage.ts`
  Depends on: none
  Unlocks: consistent feature persistence cleanup
  Done when: feature code does not bypass shared storage wrappers.

- [x] Session storage and auth runtime do not overlap ownership.
  Action: `review -> refactor`
  Priority: `P1`
  Files: `src/lib/storage/session-storage.ts`, auth runtime hooks
  Depends on: auth restore review
  Unlocks: simpler session reasoning
  Done when: storage IO and auth orchestration are clearly separate.

- [x] Preference storage modules remain pure persistence adapters.
  Action: `review`
  Priority: `P3`
  Files: `language-preference-storage.ts`, `theme-preference-storage.ts`
  Depends on: none
  Unlocks: easier provider cleanup
  Done when: these files contain persistence only, not UI branching or provider coordination.

- [x] Shell state storage is split by format, migration, and IO.
  Action: `extract -> test`
  Priority: `P1`
  Files: `src/lib/storage/shell-state-storage.ts`
  Depends on: shell state review
  Unlocks: safer shell restore changes and clearer persisted schema ownership
  Done when: encode/decode, schema, migration, and storage IO can be tested independently.

### 3.4 Navigation And Theme Utilities

- [x] Navigation helpers are actually shared and remove duplicate fallback logic.
  Action: `review`
  Priority: `P3`
  Files: `src/lib/navigation/go-back-or-replace.ts`, `src/lib/navigation/read-route-param.ts`
  Depends on: route review
  Unlocks: more predictable navigation patterns
  Done when: feature code no longer reimplements the same route-param and back-navigation helpers.

- [x] Theme entry points and token ownership are explicit.
  Action: `review -> document`
  Priority: `P2`
  Files: `src/lib/theme/index.ts`, `src/lib/theme/tamaguiThemes.ts`, `src/components/ui/ui-tokens.ts`
  Depends on: theme feature review
  Unlocks: easier developer understanding of where colors and spacing come from
  Done when: desktop-shared tokens and mobile-local theme overlays have one readable ownership story.

## 4. Shared UI And Screen Shells

### 4.1 Target Architecture Shape

Shared UI should be truly shared and business-agnostic.

- `src/components/screens/**` owns layout shells
- `src/components/ui/**` owns low-level reusable primitives
- feature-specific surfaces stay inside features

### 4.2 Shared Surface Governance

- [x] `ScreenScaffold` remains a structural shell only.
  Action: `review`
  Priority: `P2`
  Files: `src/components/screens/ScreenScaffold.tsx`
  Depends on: none
  Unlocks: predictable screen composition
  Done when: it contains no feature commands or business state.

- [x] Modal/sheet primitives stay generic.
  Action: `review`
  Priority: `P2`
  Files: `AppModalSheet.tsx`, `SheetInlineDialog.tsx`
  Depends on: none
  Unlocks: cleaner feature sheets
  Done when: primitives do not encode feature-specific branching or menu behavior.

- [x] Empty/loading/error primitives stay presentation-only.
  Action: `review`
  Priority: `P3`
  Files: `EmptyState.tsx`, `ErrorState.tsx`, `LoadingView.tsx`
  Depends on: none
  Unlocks: consistent state rendering
  Done when: they do not hide feature copy selection or business actions.

- [x] Shared UI inventory is pruned of fake reuse.
  Action: `review -> delete -> move`
  Priority: `P2`
  Files: `PaneBody.tsx`, `SectionCard.tsx`, `SheetListRow.tsx`, `StatusDot.tsx`, other `src/components/ui/**`
  Depends on: feature reviews
  Unlocks: easier developer discovery and less accidental coupling
  Done when: only real shared primitives stay under `src/components/ui`.

## 5. Shell

### 5.1 Target Architecture Shape

Shell should have explicit layers:

- routes own param framing
- screens own composition
- `view-model/` owns screen-ready data
- `commands/` owns imperative flows
- `state/` owns pure state shape and route-state translation
- `terminal/` owns transport/runtime orchestration
- workspace browser remains a separate feature integrated into shell, not swallowed by it

### 5.2 Shell Root Composition

- [x] Shell screen stays an orchestration screen, not a mixed runtime module.
  Action: `review`
  Priority: `P1`
  Files: `src/features/shell/screens/ShellScreen.tsx`
  Depends on: none
  Unlocks: stable shell layering
  Done when: shell screen no longer directly owns terminal runtime, drawer behavior, and sheet orchestration together.

- [x] Shell view-model boundary is explicit and narrow.
  Action: `review -> refactor`
  Priority: `P1`
  Files: `useShellScreenModel.tsx`, `useShellViewModel.ts`, related `view-model/**`
  Depends on: shell command/state review
  Unlocks: thinner screens and easier testing
  Done when: view-model composes screen-ready data without becoming a second command layer.

### 5.3 Drawer And Navigation Surface

- [x] Drawer render files are not also behavior owners.
  Action: `review -> refactor`
  Priority: `P1`
  Files: `ShellDrawer.tsx`, `ShellDrawerHeader.tsx`, `ShellScreenContent.tsx`
  Depends on: shell root review
  Unlocks: predictable drawer performance and easier sheet cleanup
  Done when: render components do not hold complex refresh/filter/navigation mutation choreography.

- [x] Organization selector is UI-only and delegates switching.
  Action: `review`
  Priority: `P2`
  Files: `OrganizationSelectorSheet.tsx`, org selection commands/model
  Depends on: profile/organization reviews
  Unlocks: simpler org context reasoning
  Done when: org switching has one commands owner and selector sheet stays presentational.

- [x] Workspace tree projection has one owner.
  Action: `review -> refactor -> delete`
  Priority: `P1`
  Files: `RepoSidebarNode.tsx`, `RepositoriesTab.tsx`, `shell-workspace-tree.ts`, related helpers
  Depends on: workspaces query review
  Unlocks: less duplicated hierarchy logic
  Done when: org/node/project/workspace tree projection is built in one place and legacy alternate paths are removed.

- [x] Refresh and filter state has explicit ownership and low churn.
  Action: `review -> refactor`
  Priority: `P1`
  Files: `WorkspaceTreeFilterSheet.tsx`, `useWorkspaceTreeFilterModel.ts`, `useRepositoriesRefreshNotice.ts`
  Depends on: drawer review
  Unlocks: better drawer performance and cleaner filter UX
  Done when: refresh state, filter state, hierarchy mode, and notice timing are separate concerns.

- [x] Workspace/project menus remain delegated shells.
  Action: `review -> delete`
  Priority: `P2`
  Files: row action menus, `ActionMenuSheet.tsx`, project/workspace sheet entry points
  Depends on: drawer review
  Unlocks: less modal-era residue
  Done when: menus render options only and do not become hidden behavior controllers.

### 5.4 Pane And Tab State

- [x] Route application is separated from generic pane mutation.
  Action: `extract -> test`
  Priority: `P1`
  Files: `shell-pane-state-machine.ts`
  Depends on: none
  Unlocks: safer route/state sync changes
  Done when: explicit route application is isolated from append/replace mutation logic.

- [x] Terminal tab upsert and preview tab upsert are separated.
  Action: `extract -> test`
  Priority: `P1`
  Files: `shell-pane-state-machine.ts`, `shell-pane-tab-helpers.ts`
  Depends on: pane state-machine extraction
  Unlocks: clearer tab lifecycle rules
  Done when: terminal and preview tab behavior can be reasoned about independently.

- [x] Cleanup/sanitization is separated from happy-path pane mutation.
  Action: `extract -> test`
  Priority: `P1`
  Files: `shell-pane-state-machine.ts`, `shell-pane-layout-helpers.ts`
  Depends on: pane state-machine extraction
  Unlocks: easier regression coverage for close/remove flows
  Done when: cleanup rules are explicit and not buried inside mutation helpers.

- [x] Pane store runtime/hydration/persistence split remains correct under inactive workspace scenarios.
  Action: `review -> test`
  Priority: `P1`
  Files: `useWorkspacePaneStoreRuntime.ts`, `useWorkspacePaneStoreHydration.ts`, `useWorkspacePaneStorePersistence.ts`, `useWorkspacePaneStoreCacheEffects.ts`
  Depends on: pane state-machine cleanup
  Unlocks: safe multi-workspace restore
  Done when: active-pane projection cannot silently drop inactive workspace tabs.

- [x] Selectors, equality helpers, and workspace tab helpers stay pure and discoverable.
  Action: `review -> document`
  Priority: `P2`
  Files: `shell-selectors.ts`, `shell-pane-store-equality.ts`, `shell-workspace-tabs.ts`, `shell-workspace-tree.ts`
  Depends on: pane state cleanup
  Unlocks: easier developer comprehension of state helpers
  Done when: state type ownership is obvious and no command logic leaks into helpers.

### 5.5 Commands Layer

- [x] Navigation commands and selection commands are clearly split.
  Action: `review`
  Priority: `P1`
  Files: `useShellNavigationCommands.ts`, `useShellNavigationSelectionCommands.ts`, `useShellTerminalSelectionCommands.ts`, `useShellWorkspaceSelectionCommands.ts`
  Depends on: pane state cleanup
  Unlocks: safer route changes and workspace selection work
  Done when: route navigation and selection mutation can be changed independently.

- [x] Pane commands distinguish UI-only actions from domain mutations.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `useShellPaneCommands.ts`, `useShellPaneTabUiCommands.ts`
  Depends on: pane state cleanup
  Unlocks: simpler tab UI work
  Done when: open/close/select UI behavior does not hide state write policy.

- [x] Menu and quick-action commands do not become god hooks.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `useShellMenuActions.ts`, `useShellQuickActionCommands.ts`, `useShellCreateTerminalAction.ts`, `useShellAgentQuickActions.ts`, `useShellWorkspaceBrowserQuickActions.ts`
  Depends on: drawer review
  Unlocks: more predictable action surfaces
  Done when: UI delegation, state writes, and transport effects are not all mixed in one hook.

- [x] Recovery commands are explicit flows, not utility sinks.
  Action: `extract -> test`
  Priority: `P1`
  Files: `useShellRecoveryCommands.ts`, `useShellStateMaintenance.ts`, `shell-state-maintenance-persistence.ts`, `shell-state-maintenance-persistence-domain.ts`
  Depends on: pane and terminal runtime review
  Unlocks: safe restore/cleanup changes
  Done when: restore, cleanup, reset, and repair flows can be read and tested separately.

- [x] Create-sheet models separate form state, submit behavior, and render props.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `useProjectCreateSheetModel.ts`, `useWorkspaceCreateSheetModel.ts`
  Depends on: project/workspace feature review
  Unlocks: cleaner sheet components
  Done when: create sheets do not own transport orchestration directly.

### 5.6 Terminal Runtime Layer

- [x] Session runtime remains an orchestrator, not a re-monolith.
  Action: `review`
  Priority: `P1`
  Files: `useTerminalSessionRuntime.ts`
  Depends on: none
  Unlocks: safer runtime evolution
  Done when: lifecycle, controller, sync, and command logic remain split around it.

- [x] Session command hook separates lifecycle from agent launch.
  Action: `extract -> test`
  Priority: `P1`
  Files: `useTerminalRuntimeSessionCommands.ts`
  Depends on: none
  Unlocks: cleaner agent-launch parity work
  Done when: create/attach/close and agent presets are separate command paths.

- [x] Remote sync is separated from optimistic local session state.
  Action: `extract -> test`
  Priority: `P1`
  Files: `useTerminalRuntimeSessionCommands.ts`, `useWorkspaceTerminalSessionSync.ts`
  Depends on: session command cleanup
  Unlocks: safer refresh behavior and session syncing
  Done when: daemon/relay refresh logic is isolated from local UI-only state updates.

- [x] Lifecycle, interaction handlers, controller, and output buffer keep narrow roles.
  Action: `review -> document`
  Priority: `P2`
  Files: `useTerminalRuntimeLifecycle.ts`, `useTerminalRuntimeInteractionHandlers.ts`, `useTerminalTransportController.ts`, `useTerminalTransportOutputBuffer.ts`, `terminal-runtime-lifecycle-domain.ts`, `terminal-transport-controller-domain.ts`, `terminal-transport-output-domain.ts`, `terminal-output.ts`
  Depends on: session command cleanup
  Unlocks: easier transport debugging
  Done when: each module has a clear one-line responsibility statement and no role overlap.

### 5.7 Render Surfaces

- [x] Focus pane and terminal surface model stay separated.
  Action: `review`
  Priority: `P2`
  Files: `ShellFocusPane.tsx`, `useShellTerminalSurfaceModel.ts`
  Depends on: terminal runtime review
  Unlocks: safer terminal UI changes
  Done when: render and derived surface state are separate.

- [x] Preview surface does not steal browser state ownership.
  Action: `review`
  Priority: `P2`
  Files: `ShellPreviewSurface.tsx`, preview/browser hooks
  Depends on: workspace browser review
  Unlocks: safer preview and files UX work
  Done when: preview UI consumes state rather than owning it.

- [x] Terminal DOM emulator render churn is understood and reduced.
  Action: `review -> refactor`
  Priority: `P1`
  Files: `ShellTerminalDomEmulator.tsx`
  Depends on: terminal runtime review
  Unlocks: shell performance improvements
  Done when: expected remount points are documented and expensive derived logic is moved out of render.

- [x] Chat/timeline/composer surface keeps message source, input control, and render separate.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `ShellChatSurface.tsx`, `ShellMessageTimeline.tsx`, `SessionComposer.tsx`, message hooks
  Depends on: session/runtime review
  Unlocks: future agent-session UX work
  Done when: message ownership and composer action ownership are easy to trace.

- [x] Pane tab selector split stays healthy over time.
  Action: `review`
  Priority: `P3`
  Files: `PaneTabSelectorSheet.tsx`, `PaneTabSelectorList.tsx`, `PaneTabSelectorDialogs.tsx`, `usePaneTabSelectorModel.ts`
  Depends on: pane state cleanup
  Unlocks: lower regression risk in tab UI changes
  Done when: sheet/list/dialog/model boundaries remain intact.

- [x] Quick-action sheets and shell sheets do not reintroduce modal-era state ownership.
  Action: `review -> delete`
  Priority: `P2`
  Files: `ShellQuickActionsSheet.tsx`, `ShellScreenSheets.tsx`, `ActionMenuSheet.tsx`
  Depends on: drawer and commands review
  Unlocks: cleaner shell UI composition
  Done when: sheets delegate actions instead of owning stateful behavior.

### 5.8 Workspace Browser Integration

- [x] Workspace browser screen remains an orchestration screen only.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `WorkspaceBrowserScreen.tsx`
  Depends on: workspaces query review
  Unlocks: safer files/changes/PR UX expansion
  Done when: query orchestration, route sync, and view selection do not all live in the screen.

- [x] Workspace queries keep DTO, error, and loading policy consistent.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `src/features/workspaces/queries/**`
  Depends on: shared API/query review
  Unlocks: cleaner browser surfaces and easier testability
  Done when: query hooks expose normalized feature-ready data and consistent error/loading semantics.

- [x] Workspace create form remains a pure form/domain adapter.
  Action: `review`
  Priority: `P3`
  Files: `workspaceCreateForm.ts`
  Depends on: none
  Unlocks: clearer workspace creation flow
  Done when: no networking or navigation logic is inside form helpers.

- [x] Workspaces API separates transport, normalization, and feature mapping.
  Action: `extract -> test`
  Priority: `P1`
  Files: `workspaces.api.ts`
  Depends on: shared API review
  Unlocks: safer workspace feature evolution
  Done when: request wiring, response normalization, and feature-specific adapters are clearly separated.

## 6. Domain Features

### 6.1 Target Architecture Shape

Every feature should have:

- a discoverable public entry surface
- obvious type ownership
- screens that mostly render and compose
- hooks/models that either derive data or orchestrate behavior, not both

### 6.2 Auth

- [x] Auth context owns auth state only.
  Action: `review`
  Priority: `P1`
  Files: `auth-context.ts`
  Depends on: auth provider review
  Unlocks: cleaner auth runtime
  Done when: auth context does not absorb me-only or view-only concerns.

- [x] Auth API/types keep DTO and UI model boundaries explicit.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `auth.api.ts`, `auth.types.ts`
  Depends on: shared API review
  Unlocks: cleaner auth screens and models
  Done when: UI does not directly consume raw backend DTO shapes.

- [x] Sign-in screen remains a composition screen.
  Action: `review`
  Priority: `P2`
  Files: `SignInScreen.tsx`, auth components
  Depends on: sign-in flow review
  Unlocks: easier auth surface edits
  Done when: screen composes hero/actions/version/sheet and does not swallow business logic.

- [x] Sign-in flows own mutation behavior only.
  Action: `review -> refactor`
  Priority: `P1`
  Files: `useAuthSignInFlows.ts`
  Depends on: auth callback route review
  Unlocks: simpler auth bug tracing
  Done when: sign-in hook does not also own restore, callback state, and UI branching.

- [x] Session runtime ownership is singular.
  Action: `review -> document`
  Priority: `P1`
  Files: `useAuthSessionRuntime.ts`, auth provider, me bootstrap hooks
  Depends on: auth provider review
  Unlocks: stable auth restore path
  Done when: one owner is responsible for session runtime and bootstrap sequencing.

- [x] OAuth link, temporary storage, and callback handling are separated.
  Action: `review -> refactor -> delete`
  Priority: `P2`
  Files: `auth-link.ts`, `oauth-storage.ts`, `google-oauth.ts`, `OAuthCallbackScreen.tsx`
  Depends on: callback route review
  Unlocks: safer OAuth maintenance
  Done when: each stage of the OAuth chain has one obvious file owner.

### 6.3 Me And Profile

- [x] Me API/query ownership is singular and not duplicated by auth/profile.
  Action: `review`
  Priority: `P2`
  Files: `me.api.ts`, `me.types.ts`, `useMeQuery.ts`
  Depends on: auth runtime review
  Unlocks: cleaner account display ownership
  Done when: me data source of truth is easy to identify.

- [x] Language preference sync lives at the right layer.
  Action: `review -> move`
  Priority: `P3`
  Files: `MeLanguagePreferenceSync.tsx`
  Depends on: language provider review
  Unlocks: clearer preference sync ownership
  Done when: its owner is obviously either provider-level or me-level, not ambiguous.

- [x] Profile controls root is a navigation hub only.
  Action: `review -> delete`
  Priority: `P1`
  Files: `ProfileControlsScreen.tsx`, `useProfileControlsScreenModel.ts`
  Depends on: profile route review
  Unlocks: cleaner profile/settings/org navigation
  Done when: control panel no longer behaves like leftover modal state.

- [x] Profile organizations page is a page, not a hidden selector workflow.
  Action: `review`
  Priority: `P2`
  Files: `ProfileOrganizationsScreen.tsx`, `useProfileOrganizationsScreenModel.ts`
  Depends on: organizations feature review
  Unlocks: consistent organization navigation
  Done when: page-owned navigation and data ownership are clear.

### 6.4 Organizations

- [x] Organizations API/query/types expose feature-ready data with clear ownership.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `organizations.api.ts`, `organizations.types.ts`, `useOrganizationsQuery.ts`
  Depends on: shared API review
  Unlocks: simpler org screens and models
  Done when: UI does not depend on raw backend response shape.

- [x] Organization detail model separates derive and imperative behavior.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `useOrganizationDetailModel.ts`
  Depends on: organizations API review
  Unlocks: thinner org detail screen
  Done when: screen-ready data and imperative actions are clearly separate.

- [x] Organization detail screen and sections are adequately sectioned.
  Action: `review -> extract`
  Priority: `P3`
  Files: `OrganizationDetailScreen.tsx`, `OrganizationOverviewSection.tsx`
  Depends on: organization detail model review
  Unlocks: easier org detail evolution
  Done when: screens stay thin and sections do not own data orchestration.

### 6.5 Nodes

- [x] Node data boundary is clear and does not leak into shell render concerns.
  Action: `review`
  Priority: `P2`
  Files: `nodes.api.ts`, `nodes.types.ts`, `useNodesQuery.ts`
  Depends on: shared API review
  Unlocks: clearer node filter semantics
  Done when: node DTOs and node selection rules are not spread across random UI files.

- [x] Node UI stays presentational.
  Action: `review`
  Priority: `P3`
  Files: `NodeGlyph.tsx`, `NodesListCard.tsx`
  Depends on: node data review
  Unlocks: lower accidental coupling in node surfaces
  Done when: UI components do not carry node-selection or filter business rules.

### 6.6 Projects

- [x] Project data boundary is explicit.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `projects.api.ts`, `projects.types.ts`, `useProjectsQuery.ts`
  Depends on: shared API review
  Unlocks: cleaner workspace creation integration
  Done when: project feature has a clear DTO-to-feature-data boundary.

- [x] Project forms/icons stay narrow and boring.
  Action: `review`
  Priority: `P3`
  Files: `project-form.ts`, `project-icons.tsx`
  Depends on: none
  Unlocks: easier reuse in project/workspace creation flows
  Done when: form helpers are side-effect free and icon mapping is purely visual.

### 6.7 Settings

- [x] Settings screen model does not become a controller sink.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `useSettingsScreenModel.ts`
  Depends on: providers and preferences review
  Unlocks: easier settings extension
  Done when: preference IO, navigation, and section rendering do not all live in one model hook.

- [x] Nodes settings flow is self-contained and coherent.
  Action: `review`
  Priority: `P3`
  Files: `useSettingsNodesScreenModel.ts`, `SettingsNodesScreen.tsx`
  Depends on: node review
  Unlocks: cleaner settings subpage structure
  Done when: nodes settings behavior is not partially owned by unrelated screens.

- [x] Settings screens remain composition screens.
  Action: `review`
  Priority: `P2`
  Files: `SettingsScreen.tsx`, `SettingsNodesScreen.tsx`
  Depends on: settings model review
  Unlocks: thinner settings surfaces
  Done when: screens do not inline provider writes or persistence orchestration.

- [x] Settings sections and selector sheet have clear roles.
  Action: `review -> refactor`
  Priority: `P2`
  Files: `SettingsProfileSection.tsx`, `SettingsLanguageSection.tsx`, `SettingsThemeSection.tsx`, `SettingsNotificationsSection.tsx`, `SettingsSelectorSheet.tsx`
  Depends on: settings model review
  Unlocks: consistent setting-item patterns
  Done when: section render, selection UI, and state source are clearly separated.

### 6.8 Notifications

- [x] Notification runtime helpers stay pure and narrow.
  Action: `review`
  Priority: `P3`
  Files: `notification-runtime-context.ts`, `notification-runtime-helpers.ts`
  Depends on: none
  Unlocks: safer notifications runtime changes
  Done when: helpers do not absorb UI or permission behavior.

- [x] Event stream, native bridge, and route context remain distinct roles.
  Action: `review -> document`
  Priority: `P2`
  Files: `useNotificationEventStream.ts`, `useNotificationNativeBridge.ts`, `useNotificationRouteContext.ts`
  Depends on: notifications provider review
  Unlocks: easier notifications debugging
  Done when: each hook has a one-line role and no overlap.

- [x] Permission ownership is singular.
  Action: `review`
  Priority: `P2`
  Files: `useNotificationPermission.ts`
  Depends on: notifications provider review
  Unlocks: safer permission UX changes
  Done when: permission requests are not duplicated by components or runtime hooks.

- [x] Runtime model separates event handling, banner state, and preference state.
  Action: `extract -> test`
  Priority: `P1`
  Files: `useNotificationRuntimeModel.ts`
  Depends on: notifications helper review
  Unlocks: maintainable notification runtime and better regression safety
  Done when: foreground events, banner lifecycle, and preference state can be reasoned about independently.

- [x] Notification banner stays presentational.
  Action: `review`
  Priority: `P3`
  Files: `NotificationInAppBanner.tsx`
  Depends on: runtime model cleanup
  Unlocks: simpler banner iteration
  Done when: banner render code does not hide business logic.

## 7. Theme, Language, And Copy

### 7.1 Target Architecture Shape

Developers should be able to answer these quickly:

- where does this color come from?
- where does this string come from?
- where do I add a new theme token or copy key?

### 7.2 Governance Tasks

- [x] Raw color usage in reviewed features is reduced and traceable.
  Action: `review -> refactor`
  Priority: `P2`
  Files: reviewed feature components
  Depends on: theme entry-point review
  Unlocks: easier visual consistency work
  Done when: reviewed colors resolve to theme tokens or one explicit mobile theme module.

- [x] `useAppLanguage().t()` usage is consistent and hardcoded strings are reduced.
  Action: `review -> refactor`
  Priority: `P2`
  Files: reviewed screens/components
  Depends on: none
  Unlocks: simpler localization work
  Done when: user-visible strings in reviewed areas no longer bypass i18n casually.

- [x] `copy.ts` gets an explicit ownership decision.
  Action: `review -> document`
  Priority: `P3`
  Files: `src/features/i18n/copy.ts`
  Depends on: i18n usage review
  Unlocks: clearer long-term copy structure
  Done when: the team has a written decision to keep it centralized or split by namespace, with reason.

## 8. Developer Experience And Readability

### 8.1 Target Architecture Shape

A developer opening a feature should quickly see:

- the public entry points
- the owner of types
- where commands live
- where state lives
- which files are pure helpers vs orchestration

### 8.2 DX Tasks

- [x] Public entry points are explicit for reviewed features.
  Action: `review -> document -> refactor`
  Priority: `P1`
  Files: reviewed features, especially `shell`, `auth`, `organizations`, `settings`, `workspaces`
  Depends on: feature reviews
  Unlocks: easier onboarding and less deep-import drift
  Done when: a developer can discover the supported entry surface of a feature without reading internal file paths first.

- [x] Type ownership is singular in reviewed features.
  Action: `review -> move`
  Priority: `P2`
  Files: reviewed `*.types.ts`, state helper modules, route-state helpers
  Depends on: feature reviews
  Unlocks: fewer accidental shared helper files
  Done when: feature types do not drift into random helpers or render files.

- [x] Naming matches role, not just React shape.
  Action: `review -> rename`
  Priority: `P2`
  Files: reviewed hooks/modules with ambiguous names
  Depends on: feature reviews
  Unlocks: better readability for new contributors
  Done when: files that are really commands/state/view-model/helpers are named that way.

- [x] Each reviewed subsystem gets a short contract note in code or docs if the ownership model is non-obvious.
  Action: `document`
  Priority: `P3`
  Files: reviewed subsystem entry files or docs
  Depends on: corresponding review/refactor
  Unlocks: lower knowledge-transfer cost
  Done when: non-obvious module boundaries are recorded where developers will actually look.

## 9. Legacy Cleanup

### 9.1 Target Architecture Shape

Legacy paths should not silently coexist with the new path.

If a legacy path remains, it must be a conscious defer with a reason.

### 9.2 Cleanup Tasks

- [x] Shell legacy inventory is explicit.
  Action: `review -> delete -> document`
  Priority: `P1`
  Files: shell reviewed areas
  Depends on: shell refactors
  Unlocks: lower future confusion and dead-code drag
  Done when: stale exports, pseudo-public APIs, old helper paths, and duplicate shell branches are either removed or logged as defers.
  Current inventory:
  - temporary preview tabs are still stripped from persisted shell tab state in `src/lib/storage/shell-state-storage-domain.ts` as part of the current persisted-state contract

- [x] Modal-era leftovers are removed or explicitly deferred.
  Action: `review -> delete`
  Priority: `P2`
  Files: `profile`, `settings`, `organizations`
  Depends on: feature reviews
  Unlocks: cleaner page-based navigation model
  Done when: old modal control paths do not silently coexist with page flows.

- [x] Persistence legacy is removed or documented.
  Action: `review -> delete -> document`
  Priority: `P1`
  Files: auth persistence, shell persistence, preference storage
  Depends on: storage reviews
  Unlocks: safer restore behavior
  Done when: dead fields and stale migration assumptions are resolved explicitly.
  Resolution:
  - legacy `auth/callback` route/path compatibility has been removed; mobile OAuth now accepts only the canonical callback path
  - shell persisted-state compatibility for legacy `session` selection, `backendSessionId`, `sessionsByWorkspaceId`, and missing `paneLayoutByWorkspaceId` has been removed in favor of the latest storage schema

## 10. Verification Tree

### 10.1 Automated Validation

- [x] Typecheck passes after each completed branch.
  Action: `test`
  Priority: `P1`
  Files: whole app
  Depends on: any code change
  Unlocks: safe merge confidence
  Done when: `bun run typecheck` is green.

- [x] Lint passes after each completed branch.
  Action: `test`
  Priority: `P1`
  Files: whole app
  Depends on: any code change
  Unlocks: style and structural sanity
  Done when: `bun run lint` is green.

### 10.2 State-Heavy Regression Flows

- [x] Shell regression pack is re-run after shell work.
  Action: `test`
  Priority: `P1`
  Depends on: shell changes
  Unlocks: confidence in shell merges
  Done when all of these pass:
  - restore previous workspace selection on cold start
  - preserve inactive workspace tabs
  - switch terminal / file / changes / PR tabs
  - file preview does not replace the wrong tab
  - mobile-created terminal can be closed
  - refresh current workspace syncs active sessions
  - create workspace from repository flow works
  Verification note: rerun on local web runtime against `api-service :8789`, `relay :8788`, and the
  local daemon profile wired to the same node; verified cold-start restore, tab switching,
  preview routing, terminal close, and refresh-driven active session sync.

- [x] Auth/profile/settings/orgs regression pack is re-run after non-shell account work.
  Action: `test`
  Priority: `P1`
  Depends on: auth/profile/settings/organization changes
  Unlocks: confidence in account-area merges
  Done when all of these pass:
  - sign in
  - cold-start restore
  - sign out
  - control panel -> organizations -> detail -> back
  - control panel -> settings -> back
  - settings theme / language / notifications changes apply correctly
  Verification note: rerun on local web runtime; verified explicit sign-out to the public
  root, local-session restore back into authenticated shell, organizations list/detail
  navigation, and settings route rendering with current theme/language/notification values.

- [x] Notification regression pack is re-run after notifications work.
  Action: `test`
  Priority: `P2`
  Depends on: notification changes
  Unlocks: confidence in app-runtime changes
  Done when all of these pass:
  - frontend-events websocket receives `notificationEvent` on the local runtime
  - non-current terminal/workspace events update unread or indicator state
  - current-platform notification permission path behaves correctly
  Verification note: rerun on local web runtime; verified websocket delivery from daemon hook
  ingress through `api-service :8789`, workspace unread tone update for non-current terminal
  events, and the web settings path continuing to report unsupported notification permissions.

## 11. Explicit Defers

- [x] `copy.ts` can remain centralized if splitting is only mechanical and does not improve ownership.
  Action: `document`
  Priority: `P3`
  Depends on: i18n review
  Unlocks: avoids churn without benefit
  Done when: decision and reason are explicit.

- [x] Shared UI extraction should wait until there are at least two real call sites.
  Action: `document`
  Priority: `P3`
  Depends on: UI reviews
  Unlocks: avoids fake abstractions
  Done when: feature-local components are not prematurely promoted to shared UI.

- [x] Desktop-side refactors remain out of scope unless mobile parity truly requires them.
  Action: `document`
  Priority: `P3`
  Depends on: parity investigations
  Unlocks: tighter scope control
  Done when: mobile cleanup stays mobile-owned by default.
