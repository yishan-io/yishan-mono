/**
 * Allowlist data for `architecture.test.ts` (Desktop renderer dependency rules).
 *
 * Rows are baselined violations that later Domain phases remove. Every row
 * carries the tag of the Domain phase that owns its removal (`D3`-`D17`).
 * The architecture test fails on stale rows and on rows tagged with a
 * completed phase (`COMPLETED_PHASES`), so keep this list in sync with the
 * code. Re-tag a row when its removal phase changes; remove a row in the
 * change that fixes the violation.
 *
 * Phase D2 (Domains plan) re-owned the list: terminology changed from
 * Feature module to Domain, the allowlist mechanism changed from a single
 * `CURRENT_PHASE` to per-row owning phases, and three new rules were added:
 *
 *   - R14-cross-domain-deep: a cross-Domain import must go through the
 *     Domain's public `index.ts` (or the Domain root); deep imports into
 *     another Domain's internals are violations.
 *   - R15-app-from-domain: Domain code must not import `app`.
 *   - R16-app-deep-into-domain: App code must not deep-import a Domain.
 *
 * Phase D2 also re-tagged the Phase 16 baseline rows: R6/R7 rows moved to
 * the owning Domain phase, R9 ui rows to D17 (Final Closure removes root ui
 * product behavior).
 */

export type RuleName =
  | "R1-value-api-rpc"
  | "R1-main"
  | "R1b-shared-contracts"
  | "R3"
  | "R4"
  | "R5-cross-feature-internal"
  | "R6-state-layer"
  | "R7-model-layer"
  | "R8-infra-layer"
  | "R9-ui-components"
  | "R10-workspace-workbench"
  | "R11-workbench-product-import"
  | "R12-store-action-promise"
  | "R13-getter-forwarding-action-file"
  | "R14-cross-domain-deep"
  | "R15-app-from-domain"
  | "R16-app-deep-into-domain";

export type KnownViolation = { rule: RuleName; file: string; phase: string };

/**
 * Phases whose allowlist rows must already be removed. Bump this when a
 * Desktop phase completes; the test rejects rows tagged with any of these
 * phases, which prevents allowlist rows for completed phases.
 */
export const COMPLETED_PHASES = ["P16", "D1", "D3", "D4", "D5"] as const;

export const KNOWN_VIOLATIONS: KnownViolation[] = [
  // ---- R6-state-layer (owning phase = the Domain that owns the store) ----
  // desktop6-adjust W1: Workspace Store types moved to Workspace State; the
  // store boundary keeps transport DTO references (baselined like the other
  // workspace projection store rows). actions.localFolders/actions.workspaces
  // rows removed — those files no longer import transport directly.
  { rule: "R6-state-layer", file: "domains/workspace/state/workspaceStoreTypes.ts", phase: "D8" },
  // desktop6-adjust W4: git projections moved from the Workspace feature to
  // the Git feature; the transport-DTO boundary on the store keeps the same
  // baselined R6 row (was domains/workspace/state/workspaceProjectionStore.ts).
  // ---- R7-model-layer (owning phase = the Domain that owns the model) ----
  // desktop6-adjust W1: workbench/model/types.ts row removed — the generic
  // types file no longer imports transport/zustand (tab types moved to
  // tabTypes.ts, Workspace Store types moved to Workspace State).
  // desktop6-adjust W4: snapshotReconciler no longer imports git transport
  // types; it remains the workspace/project DTO boundary. D8 removed its
  // workspace state import (R7 occurrence) and project deep import (R14);
  // the api/types transport boundary keeps this R7 row (baseline R7 = 2).
  { rule: "R7-model-layer", file: "domains/workspace/model/snapshotReconciler.ts", phase: "D8" },
  // ---- R9-ui-components (owning phase = D17 Final Closure removes root ui behavior) ----
  { rule: "R9-ui-components", file: "ui/hooks/useCodeTheme.ts", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/hooks/useDialogRegistration.ts", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/hooks/useRemoteHealthQuery.ts", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/hooks/useThemePreference.tsx", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/layout/AppMenuOrganizationSubmenu.tsx", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/layout/AppMenuView.tsx", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/layout/AppShell.tsx", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/layout/CreateOrganizationDialogView.tsx", phase: "D17" },
  { rule: "R9-ui-components", file: "ui/layout/useAppMenuViewState.ts", phase: "D17" },
  // ---- R14-cross-domain-deep (Phase D2 baseline; owning phase = importing Domain) ----
  { rule: "R14-cross-domain-deep", file: "domains/settings/state/agentSettingsStore.ts", phase: "D16" },
  // ---- R15-app-from-domain (Phase D2 baseline; owning phase = importing Domain) ----
  // ---- R16-app-deep-into-domain (Phase D2 baseline; owning phase = D17 App audit) ----
  { rule: "R16-app-deep-into-domain", file: "app/commands/appCommands.ts", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/commands/composition.ts", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/commands/tabCloseHandler.ts", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/events/index.ts", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/flows/workspaceSnapshotFlow.ts", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/routes/AppRoutes.tsx", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/routes/WorkspaceView.tsx", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/runtime/useShortcuts.ts", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/selectors.ts", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/ui/MainPaneTitleBarView.tsx", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/ui/WorkspacePortsMenuControl.tsx", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/ui/mainPaneTitleBarHelpers.tsx", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/ui/mainPaneTitleBarMenus.tsx", phase: "D17" },
  { rule: "R16-app-deep-into-domain", file: "app/ui/useTabContentRenderer.tsx", phase: "D17" },
];
