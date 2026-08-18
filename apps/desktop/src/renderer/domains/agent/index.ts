/**
 * Agent feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, agent chat models, and public state
 * surfaces. Internal Stores and Runtime implementations are not exported.
 */
export type { AgentCommands } from "./commands/contract";
export type { AgentModelInfo } from "./commands/agentCommands";
export { listAgentModels } from "./commands/agentCommands";
export { clearTerminalAgentStatus } from "./commands/agentSessionLifecycle";
export { formatAgentSessionTitle, normalizeAgentSessionTitle, parseSkillMessage } from "./model/agentSkillTextHelpers";
export {
  THINKING_LEVELS,
  clampThinkingLevel,
  formatSupportedThinkingLevels,
  getSupportedThinkingLevels,
  isThinkingLevelSupported,
  type ThinkingLevel,
} from "./model/agentThinkingLevels";
export {
  getPiProviderCatalogEntry,
  getPiProviderDisplayName,
  getPiProviderIcon,
  getPiProviderIconColor,
  getPiProviderPinEnv,
  isKnownPiProviderId,
  isPiProviderApiKeyCapable,
  isPiProviderOAuthCapable,
  isPiProviderSubscriptionCapable,
  PI_PROVIDER_CATALOG,
  type PiProviderAuthMode,
  type PiProviderCatalogEntry,
} from "./model/piProviders";
export { KimiIcon } from "./ui/piProviderIcons";
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
export { removeTabData, removeWorkspaceTaskCounts, markWorkspaceNotificationsRead } from "./state/chatActions";
export type { WorkspaceAgentStatus, WorkspaceUnreadTone } from "./state/chatStore";
// Agent event-pipeline entry points required by cross-feature composition.
// Re-exported through the public API instead of the events module (Phase 17).
export {
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "./events/agentChatPiEventShared";

// Stable UI entry points for cross-feature composition (Phase 18).
export { AgentChatView } from "./features/agent-chat/chat/AgentChatView";
export { RecentAgentSessions } from "./features/agent-chat/chat/RecentAgentSessions";
export { WorkspaceAgentChatSurface } from "./features/agent-chat/chat/WorkspaceAgentChatSurface";
export { AgentIcon } from "./ui/AgentIcon";
export { AgentModelSelector } from "./features/agent-chat/session/AgentModelSelector";
export { SessionHistoryMenu } from "./features/agent-chat/session/SessionHistoryMenu";
export { ThinkingLevelControl, THINKING_LEVEL_LABELS } from "./features/agent-chat/session/ThinkingLevelControl";
export {
  ModelPickerMenu,
  ProviderMark,
  buildModelPickerOption,
  groupModelPickerOptionsByProvider,
  splitModelId,
  stripProviderPrefix,
  type ModelPickerOption,
} from "./features/model-picker";
export {
  useWorkspaceAgentStatusByWorkspaceId,
  useWorkspaceUnreadToneByWorkspaceId,
} from "./hooks/useAgentChatReadHooks";
export { findTabWithSession } from "./commands/agentChatCommands";
export { fetchAgentSessionFilePath } from "./commands/agentChatSessionHistory";
export { ProviderCredentialDialog } from "./ui/credentials/ProviderCredentialDialog";
