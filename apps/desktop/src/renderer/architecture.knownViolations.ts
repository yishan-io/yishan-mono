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
  | "R9-ui-components";

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
  { rule: "R6-state-layer", file: "features/workspace/state/workspace/actions.localFolders.ts", phase: "P16" },
  { rule: "R6-state-layer", file: "features/workspace/state/workspace/actions.selection.ts", phase: "P16" },
  { rule: "R6-state-layer", file: "features/workspace/state/workspace/actions.workspaces.ts", phase: "P16" },
  { rule: "R6-state-layer", file: "features/workspace/state/workspaceProjectionStore.ts", phase: "P16" },
  // ---- R7-model-layer (Phase 16 baseline) ----
  { rule: "R7-model-layer", file: "features/agent/model/agentChatStore.ts", phase: "P16" },
  { rule: "R7-model-layer", file: "features/workbench/model/types.ts", phase: "P16" },
  { rule: "R7-model-layer", file: "features/workspace/model/snapshotReconciler.ts", phase: "P16" },
  // ---- R9-ui-components (Phase 16 baseline) ----
  { rule: "R9-ui-components", file: "components/AppUpdateSnackbar.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/AudioPreview.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/AuthSessionExpiredSnackbar.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/FileDiffViewer.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/FileEditor.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/ImagePreview.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/MessageList.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/MultiFileDiffViewer.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/ProjectRow.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/SplitDropZone.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/SplitPaneContainer.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/SplitPaneGroup.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/TabBarMenus.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/VideoPreview.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/WorkspaceRow.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/WorkspaceTree/types.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/WorkspaceTree/useVisibleWorkspaceTree.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/session/AgentChatSubagentRow.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/session/AgentChatUsageSummaryLabel.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/session/AgentModelSelector.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/session/AgentModelSelectorMenu.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/session/SessionHistoryMenu.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/session/helpers.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/tool-calls/DiffToolCard.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/tool-calls/helpers.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/transcript/AgentMarkdownContent.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/transcript/AgentMessageList.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/transcript/ThinkingBlock.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/transcript/ToolResultMessageContent.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/transcript/UserMessageRow.tsx", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/transcript/helpers.ts", phase: "P16" },
  { rule: "R9-ui-components", file: "components/agent/transcript/turnModel.ts", phase: "P16" },
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
  { rule: "R5-cross-feature-internal", file: "features/git/ui/hooks/useGitAuthorName.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/ui/hooks/useTerminalTabLookups.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/overview/ui/OverviewView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/CreateScheduledJobFormView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/EditScheduledJobDialogView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/ScheduledJobDetailFields.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/ScheduledJobDetailView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/ScheduledJobListItemView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/AccountSettingsView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/GitWorkspaceSettingsView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/LanguageSettingsView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/LinkSettingsView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/MarkdownSettingsView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/MemberSettingsView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/NodesSettingsView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/TerminalSettingsView.tsx", phase: "P16" },
  {
    rule: "R5-cross-feature-internal",
    file: "features/settings/ui/daemon/daemonSettings/closeTerminalTabsForDaemonRestart.ts",
    phase: "P16",
  },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalRuntimeRegistry.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/AgentChatComposerPane.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/DaemonVersionWarningControl.tsx", phase: "P16" },
  {
    rule: "R5-cross-feature-internal",
    file: "features/workspace/ui/LeftPane/CreateWorkspaceDialogView.tsx",
    phase: "P16",
  },
  {
    rule: "R5-cross-feature-internal",
    file: "features/workspace/ui/LeftPane/useCreateWorkspaceDialogState.ts",
    phase: "P16",
  },
  {
    rule: "R5-cross-feature-internal",
    file: "features/workspace/ui/LeftPane/useProjectListFoldState.ts",
    phase: "P16",
  },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/useProjectListTreeData.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/MainPaneView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/OnboardingView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/WorkspaceSplitPaneView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/terminal/TerminalView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/terminal/useTerminalFileDrop.ts", phase: "P16" },
  {
    rule: "R5-cross-feature-internal",
    file: "features/workspace/ui/terminal/useTerminalWakeRecovery.ts",
    phase: "P16",
  },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/usePaneTabHandlers.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/agent/commands/agentChatCommands.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/agent/commands/agentChatSubagentCommands.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/agent/commands/piProviderCommands.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/agent/events/agentChatSubagentEvents.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/agent/runtime/agentChatRecovery.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/agent/runtime/agentSessionRuntime.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/files/ui/FileManagerView.tsx", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/files/ui/useFileTreeOperations.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/git/commands/gitCommands.ts", phase: "P16" },
  {
    rule: "R5-cross-feature-internal",
    file: "features/notification/events/notificationEventHandlers.ts",
    phase: "P16",
  },
  { rule: "R5-cross-feature-internal", file: "features/organization/commands/orgCommands.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/project/commands/projectCommands.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/events/terminalEventHandlers.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/events/terminalSessionTabReconciler.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalRecovery.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalSessionOrchestrator.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalSessionService.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalTitleUtils.ts", phase: "P16" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/commands/workspaceCreateCommand.ts", phase: "P16" },
  {
    rule: "R5-cross-feature-internal",
    file: "features/workspace/state/workspace/actions.localFolders.ts",
    phase: "P16",
  },
  { rule: "R5-cross-feature-internal", file: "features/workspace/state/workspace/actions.selection.ts", phase: "P16" },
];
