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
  { rule: "R6-state-layer", file: "domains/overview/state/overviewStore.ts", phase: "D14" },
  { rule: "R6-state-layer", file: "domains/scheduled-job/state/scheduledJobStore.ts", phase: "D15" },
  // desktop6-adjust W1: Workspace Store types moved to Workspace State; the
  // store boundary keeps transport DTO references (baselined like the other
  // workspace projection store rows). actions.localFolders/actions.workspaces
  // rows removed — those files no longer import transport directly.
  { rule: "R6-state-layer", file: "domains/workspace/state/workspaceStoreTypes.ts", phase: "D8" },
  // desktop6-adjust W4: git projections moved from the Workspace feature to
  // the Git feature; the transport-DTO boundary on the store keeps the same
  // baselined R6 row (was domains/workspace/state/workspaceProjectionStore.ts).
  { rule: "R6-state-layer", file: "domains/git/state/gitProjectionStore.ts", phase: "D10" },
  // ---- R7-model-layer (owning phase = the Domain that owns the model) ----
  { rule: "R7-model-layer", file: "domains/agent/model/agentChatStore.ts", phase: "D12" },
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
  { rule: "R14-cross-domain-deep", file: "domains/agent/commands/agentChatCommands.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/commands/agentChatSubagentCommands.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/commands/piProviderCommands.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/runtime/agentChatRecovery.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/runtime/agentSessionRuntime.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/ui/chat/AgentChatComposerPane.tsx", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/ui/chat/AgentChatView.tsx", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/ui/chat/WorkspaceAgentChatSurface.tsx", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/ui/chat/agentChatSlashCommandCache.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/ui/chat/useAgentChatSessionLifecycle.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/ui/tool-calls/helpers.ts", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/agent/ui/transcript/AgentMarkdownContent.tsx", phase: "D12" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/FileManagerView.tsx", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/diff/MultiFileDiffViewer.tsx", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/diff/multiFileDiffViewerHelpers.ts", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/hooks/useGitGutterDecorations.ts", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/rightPaneDelete.ts", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/useFileTreeCrud.ts", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/useFileTreeOperations.ts", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/files/ui/useFileTreeUndo.ts", phase: "D9" },
  { rule: "R14-cross-domain-deep", file: "domains/git/commands/diffTabContentCommands.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/commands/gitCommands.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/commands/gitProjectionCommands.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/model/diffTabPlaceholder.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/runtime/allWorkspacesGitSyncRuntime.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/state/diffTabContentStore.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/state/gitProjectionStore.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/ui/hooks/useGitAuthorName.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/git/ui/useChangesTabActions.ts", phase: "D10" },
  { rule: "R14-cross-domain-deep", file: "domains/notification/events/notificationEventHandlers.ts", phase: "D13" },
  { rule: "R14-cross-domain-deep", file: "domains/overview/ui/OverviewFiltersView.tsx", phase: "D14" },
  { rule: "R14-cross-domain-deep", file: "domains/overview/ui/OverviewView.tsx", phase: "D14" },
  { rule: "R14-cross-domain-deep", file: "domains/scheduled-job/ui/CreateScheduledJobFormView.tsx", phase: "D15" },
  { rule: "R14-cross-domain-deep", file: "domains/scheduled-job/ui/EditScheduledJobDialogView.tsx", phase: "D15" },
  { rule: "R14-cross-domain-deep", file: "domains/scheduled-job/ui/ScheduledJobDetailFields.tsx", phase: "D15" },
  { rule: "R14-cross-domain-deep", file: "domains/scheduled-job/ui/ScheduledJobListItemView.tsx", phase: "D15" },
  { rule: "R14-cross-domain-deep", file: "domains/settings/ui/AgentProviderSettingsView.tsx", phase: "D16" },
  { rule: "R14-cross-domain-deep", file: "domains/settings/ui/AgentSkillsCardDialogs.tsx", phase: "D16" },
  { rule: "R14-cross-domain-deep", file: "domains/settings/ui/GitWorkspaceSettingsView.tsx", phase: "D16" },
  { rule: "R14-cross-domain-deep", file: "domains/settings/ui/ProviderCredentialDialog.tsx", phase: "D16" },
  { rule: "R14-cross-domain-deep", file: "domains/settings/ui/RemoveProviderDialog.tsx", phase: "D16" },
  { rule: "R14-cross-domain-deep", file: "domains/settings/ui/TerminalSettingsView.tsx", phase: "D16" },
  { rule: "R14-cross-domain-deep", file: "domains/settings/ui/customize/ModelThinkingSelector.tsx", phase: "D16" },
  {
    rule: "R14-cross-domain-deep",
    file: "domains/settings/ui/daemon/daemonSettings/closeTerminalTabsForDaemonRestart.ts",
    phase: "D16",
  },
  { rule: "R14-cross-domain-deep", file: "domains/terminal/events/terminalEventHandlers.ts", phase: "D11" },
  { rule: "R14-cross-domain-deep", file: "domains/terminal/events/terminalSessionTabReconciler.ts", phase: "D11" },
  { rule: "R14-cross-domain-deep", file: "domains/terminal/runtime/terminalSessionService.ts", phase: "D11" },
  { rule: "R14-cross-domain-deep", file: "domains/terminal/runtime/terminalTitleUtils.ts", phase: "D11" },
  // ---- R15-app-from-domain (Phase D2 baseline; owning phase = importing Domain) ----
  { rule: "R15-app-from-domain", file: "domains/agent/ui/chat/ChatView.tsx", phase: "D12" },
  { rule: "R15-app-from-domain", file: "domains/agent/ui/chat/RecentAgentSessions.tsx", phase: "D12" },
  { rule: "R15-app-from-domain", file: "domains/agent/ui/transcript/AgentMarkdownContent.tsx", phase: "D12" },
  { rule: "R15-app-from-domain", file: "domains/files/ui/FileManagerView.tsx", phase: "D9" },
  { rule: "R15-app-from-domain", file: "domains/files/ui/hooks/useDetectedExternalAppIds.ts", phase: "D9" },
  { rule: "R15-app-from-domain", file: "domains/files/ui/markdown/markdownPreviewDom.ts", phase: "D9" },
  { rule: "R15-app-from-domain", file: "domains/files/ui/useFileTreeOperations.ts", phase: "D9" },
  { rule: "R15-app-from-domain", file: "domains/git/ui/PullRequestTabView.tsx", phase: "D10" },
  { rule: "R15-app-from-domain", file: "domains/git/ui/hooks/useGitAuthorName.ts", phase: "D10" },
  { rule: "R15-app-from-domain", file: "domains/git/ui/pullRequestTab/PullRequestChecksSection.tsx", phase: "D10" },
  {
    rule: "R15-app-from-domain",
    file: "domains/git/ui/pullRequestTab/PullRequestDeploymentsSection.tsx",
    phase: "D10",
  },
  { rule: "R15-app-from-domain", file: "domains/git/ui/pullRequestTab/PullRequestHeaderSection.tsx", phase: "D10" },
  { rule: "R15-app-from-domain", file: "domains/git/ui/pullRequestTab/PullRequestHistoryRow.tsx", phase: "D10" },
  { rule: "R15-app-from-domain", file: "domains/git/ui/useChangesTabActions.ts", phase: "D10" },
  { rule: "R15-app-from-domain", file: "domains/git/ui/useChangesTabState.ts", phase: "D10" },
  { rule: "R15-app-from-domain", file: "domains/notification/events/notificationEventHandlers.ts", phase: "D13" },
  { rule: "R15-app-from-domain", file: "domains/overview/ui/OverviewView.tsx", phase: "D14" },
  { rule: "R15-app-from-domain", file: "domains/scheduled-job/ui/CreateScheduledJobFormView.tsx", phase: "D15" },
  { rule: "R15-app-from-domain", file: "domains/scheduled-job/ui/EditScheduledJobDialogView.tsx", phase: "D15" },
  { rule: "R15-app-from-domain", file: "domains/scheduled-job/ui/ScheduledJobListItemView.tsx", phase: "D15" },
  { rule: "R15-app-from-domain", file: "domains/scheduled-job/ui/ScheduledJobView.tsx", phase: "D15" },
  { rule: "R15-app-from-domain", file: "domains/scheduled-job/ui/useScheduledJobDetailState.ts", phase: "D15" },
  { rule: "R15-app-from-domain", file: "domains/settings/commands/settingsCommands.ts", phase: "D16" },
  { rule: "R15-app-from-domain", file: "domains/settings/ui/AgentProviderSettingsView.tsx", phase: "D16" },
  { rule: "R15-app-from-domain", file: "domains/settings/ui/ProviderCredentialDialog.tsx", phase: "D16" },
  { rule: "R15-app-from-domain", file: "domains/settings/ui/RemoveProviderDialog.tsx", phase: "D16" },
  { rule: "R15-app-from-domain", file: "domains/settings/ui/TerminalSettingsView.tsx", phase: "D16" },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/daemon/daemonSettings/DaemonConnectionSection.tsx",
    phase: "D16",
  },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/daemon/daemonSettings/DaemonRelaySection.tsx",
    phase: "D16",
  },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/daemon/daemonSettings/useDaemonConnectionState.ts",
    phase: "D16",
  },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/daemon/daemonSettings/useDaemonLogDialog.ts",
    phase: "D16",
  },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/daemon/daemonSettings/useQuitOnExitSetting.ts",
    phase: "D16",
  },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/notifications/useNotificationSettingsPersistence.ts",
    phase: "D16",
  },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/notifications/useNotificationSettingsPreview.ts",
    phase: "D16",
  },
  {
    rule: "R15-app-from-domain",
    file: "domains/settings/ui/notifications/useNotificationSettingsState.ts",
    phase: "D16",
  },
  { rule: "R15-app-from-domain", file: "domains/terminal/events/terminalEventHandlers.ts", phase: "D11" },
  { rule: "R15-app-from-domain", file: "domains/terminal/runtime/terminalAddons.ts", phase: "D11" },
  { rule: "R15-app-from-domain", file: "domains/terminal/ui/TerminalView.tsx", phase: "D11" },
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
