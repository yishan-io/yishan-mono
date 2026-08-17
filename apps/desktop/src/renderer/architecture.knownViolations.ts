/**
 * Allowlist data for `architecture.test.ts` (Desktop renderer dependency rules).
 *
 * Rows are baselined violations from earlier phases that later phases remove.
 * Every row carries the tag of the phase that currently owns the baseline
 * (`CURRENT_PHASE`). The architecture test fails on stale rows and on rows
 * tagged with a completed phase, so keep this list in sync with the code.
 *
 * Phase 16 re-owned the whole list: the 14 rows whose only R6 violation was a
 * normal Zustand import were removed (R6 no longer flags Zustand), and every
 * remaining row was re-tagged from its historical phase (P14/P15) to P16.
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
  | "R13-getter-forwarding-action-file";

export type KnownViolation = { rule: RuleName; file: string; phase: string };

/**
 * The phase that owns the current allowlist. Bump this when a new Desktop
 * phase starts; the test rejects rows tagged with any other phase, which
 * prevents allowlist rows for completed phases.
 */
export const CURRENT_PHASE = "P16";

export const KNOWN_VIOLATIONS: KnownViolation[] = [
  // ---- R6-state-layer (Phase 16 baseline) ----
  { rule: "R6-state-layer", file: "features/overview/state/overviewStore.ts", phase: "P16" },
  { rule: "R6-state-layer", file: "features/scheduled-job/state/scheduledJobStore.ts", phase: "P16" },
  // desktop6-adjust W1: Workspace Store types moved to Workspace State; the
  // store boundary keeps transport DTO references (baselined like the other
  // workspace projection store rows). actions.localFolders/actions.workspaces
  // rows removed — those files no longer import transport directly.
  { rule: "R6-state-layer", file: "features/workspace/state/workspaceStoreTypes.ts", phase: "P16" },
  // desktop6-adjust W4: git projections moved from the Workspace feature to
  // the Git feature; the transport-DTO boundary on the store keeps the same
  // baselined R6 row (was features/workspace/state/workspaceProjectionStore.ts).
  { rule: "R6-state-layer", file: "features/git/state/gitProjectionStore.ts", phase: "P16" },
  // ---- R7-model-layer (Phase 16 baseline) ----
  { rule: "R7-model-layer", file: "features/agent/model/agentChatStore.ts", phase: "P16" },
  // desktop6-adjust W1: workbench/model/types.ts row removed — the generic
  // types file no longer imports transport/zustand (tab types moved to
  // tabTypes.ts, Workspace Store types moved to Workspace State).
  // desktop6-adjust W4: snapshotReconciler no longer imports git transport
  // types; it remains the workspace/project DTO boundary (api/types +
  // workspace state import), so its R7 row stays.
  { rule: "R7-model-layer", file: "features/workspace/model/snapshotReconciler.ts", phase: "P16" },
  // ---- R9-ui-components (Phase 16 baseline) ----
  { rule: "R9-ui-components", file: "components/AppUpdateSnackbar.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/AuthSessionExpiredSnackbar.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/FileDiffViewer.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/FileEditor.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/MessageList.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/MultiFileDiffViewer.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/ProjectRow.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/WorkspaceRow.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/WorkspaceTree/types.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/WorkspaceTree/useVisibleWorkspaceTree.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/fileEditor/VditorFileEditor.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/fileEditor/useMonacoFileEditor.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/markdown/MarkdownPreviewRenderer.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/markdown/MarkdownPreviewThemeProvider.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/markdown/markdownPreviewDom.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/multiFileDiffViewer/multiFileDiffViewerHelpers.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/projectIcons.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/useVoiceRecording.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/hooks/useCodeTheme.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/hooks/useDialogRegistration.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/hooks/useRemoteHealthQuery.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/hooks/useThemePreference.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/layout/AppMenuOrganizationSubmenu.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/layout/AppMenuView.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/layout/AppShell.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/layout/CreateOrganizationDialogView.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "ui/layout/useAppMenuViewState.ts", phase: "P16" },
  // ---- R5-cross-feature-internal (Phase 16 baseline) ----
];
