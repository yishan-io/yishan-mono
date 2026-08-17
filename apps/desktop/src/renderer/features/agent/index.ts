/**
 * Agent feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, agent chat models, and public state
 * surfaces. Internal Stores and Runtime implementations are not exported.
 */
export type { AgentCommands } from "./commands/contract";
export {
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION,
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND,
  DEFAULT_AGENT_COMMANDS,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  createDefaultAgentInUseByKind,
  getAgentIconPresentation,
  isDesktopAgentKind,
  type AgentIconContext,
  type AgentIconPresentation,
  type AgentIconThemeMode,
  type DesktopAgentKind,
} from "./model/agentSettings";
export type {
  AgentCompactionReason,
  AgentContentBlock,
  AgentMessage,
  AgentModel,
  AgentPendingUiAutoResponse,
  AgentPendingUiOption,
  AgentPendingUiRequest,
  AgentSessionState,
  AgentSubagentCancelState,
  AgentThinkingSignature,
  AgentThinkingSignatureSummary,
} from "./model/agentChatTypes";
export { isAgentSessionBusy } from "./model/agentChatTypes";
export { removeTabData, removeWorkspaceTaskCounts } from "./state/chatActions";
export type { WorkspaceAgentStatus, WorkspaceUnreadTone } from "./state/chatStore";
// Agent event-pipeline entry points required by cross-feature composition.
// Re-exported through the public API instead of the events module (Phase 17).
export {
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "./events/agentChatPiEventShared";

// Stable UI entry points for cross-feature composition (Phase 18).
export { AgentChatView } from "./ui/chat/AgentChatView";
export { RecentAgentSessions } from "./ui/chat/RecentAgentSessions";
export { WorkspaceAgentChatSurface } from "./ui/chat/WorkspaceAgentChatSurface";
export { AgentIcon } from "./ui/AgentIcon";
export { AgentModelSelector } from "./ui/session/AgentModelSelector";
export { SessionHistoryMenu } from "./ui/session/SessionHistoryMenu";
export { ThinkingLevelControl, THINKING_LEVEL_LABELS } from "./ui/session/ThinkingLevelControl";
export {
  ModelPickerMenu,
  ProviderMark,
  buildModelPickerOption,
  groupModelPickerOptionsByProvider,
  splitModelId,
  stripProviderPrefix,
  type ModelPickerOption,
} from "./ui/model-picker";
export {
  useWorkspaceAgentStatusByWorkspaceId,
  useWorkspaceUnreadToneByWorkspaceId,
} from "./ui/hooks/useAgentChatReadHooks";
export { findTabWithSession } from "./commands/agentChatCommands";
export { fetchAgentSessionFilePath } from "./commands/agentChatSessionHistory";
