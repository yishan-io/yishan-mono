/**
 * Agent feature public API.
 *
 * Exports the stable command surface, agent chat models, and public state
 * surfaces. Internal Stores and Runtime implementations are not exported.
 *
 * Ordering constraint: the leaf `model/agentSettings`
 * re-export must stay FIRST. The Agent enablement store
 * (`state/agentSettingsStore`) imports this module and calls
 * `createDefaultAgentInUseByKind` at evaluation time, and Agent features
 * import the settings index back (eval cycle). A mid-cycle importer can read
 * the binding only after this statement executes; moving it later re-triggers
 * `createDefaultAgentInUseByKind is not a function`.
 */
export {
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION,
  DEFAULT_AGENT_COMMANDS,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  isDesktopAgentKind,
  type DesktopAgentKind,
} from "./providers";
export {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND,
  type AgentIconContext,
  type AgentIconPresentation,
} from "./ui/agentIconPresentation";

export type { AgentModelInfo } from "./commands/agentCommands";
export { listAgentDetectionStatuses, listAgentModels } from "./commands/agentCommands";
export {
  listPiProviders,
  openPiProviderLogin,
  removePiProvider,
  savePiProvider,
  type PiProviderStatus,
} from "./commands/piProviderCommands";
export {
  clearTerminalAgentStatus,
  parseObserverSessionKey,
  recordAgentObserverStatus,
  resetAgentLifecycleState,
} from "./commands/agentSessionLifecycle";
export { formatAgentSessionTitle } from "./skills/agentSkillText";
export type { ThinkingLevel } from "./providers";
export type { PiProviderAuthMode, PiProviderCatalogEntry } from "./providers";

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
} from "./chat";

export { agentChatStore, type AgentChatStoreState } from "./state/agentChatStore";
export { chatStore, type ChatStoreState, type WorkspaceAgentStatus, type WorkspaceUnreadTone } from "./state/chatStore";
// Agent event-pipeline entry points required by cross-feature composition.
// Re-exported through the public API instead of the events module.

// Stable UI entry points for cross-feature composition.
export { AgentChatView } from "./features/agent-chat/chat/AgentChatView";
export { RecentAgentSessions } from "./features/agent-chat/chat/RecentAgentSessions";
export { WorkspaceAgentChatSurface } from "./features/agent-chat/chat/WorkspaceAgentChatSurface";
export { AgentIcon } from "./ui/AgentIcon";

export { SessionHistoryMenu } from "./features/agent-chat/session/SessionHistoryMenu";

export {
  ModelPickerMenu,
  buildModelPickerOption,
  groupModelPickerOptionsByProvider,
  stripProviderPrefix,
  type ModelPickerOption,
} from "./features/select-model";
export { ProviderMark } from "./ui/ProviderMark";

export { findTabWithSession, renameAgentChatSessionByTab, stopPiSession } from "./commands/agentChatCommands";
export { fetchAgentSessionFilePath, listActivePiSessions } from "./commands/agentChatSessionHistory";

// Agent enablement preferences owned by Agent, consumed by the Settings CLI
// feature through the public API (desktop7 Phase 21 — moved from Settings so
// the settings→agent edge never evaluates this store mid-cycle).
export { AGENT_SETTINGS_STORE_STORAGE_KEY } from "./state/agentSettingsStore";
export { agentSettingsStore, type AgentSettingsStoreState } from "./state/agentSettingsStore";
export { AgentChatRecoveryCoordinator } from "./runtime/agentChatRecovery";
export {
  appendChatMessages,
  closeAgentSession,
  createWorkspaceChatEventHandler,
  ensureChatSession,
  getChatMessages,
  runChatPrompt,
  setChatAvailableModels,
  setChatCurrentModel,
  updateChatMessage,
} from "./commands/chatCommands";
// Agent configuration + definition commands (desktop7 Phase 23 — moved from Settings).

export { getVoiceTranscriptionUsage } from "./api/voiceTranscriptionApi";
export type { VoiceTranscriptionResponse, VoiceTranscriptionUsageRecord } from "./api/types";
export {
  checkAgentGlobalConfigExternalDirectoryPermission,
  ensureAgentGlobalConfigExternalDirectoryPermission,
} from "./commands/agentConfigCommands";

// Agent administration UI composed by the Settings shell.
export { AgentProviderSettingsView } from "./features/manage-providers/AgentProviderSettingsView";
export { SkillsSettingsView } from "./features/manage-skills/SkillsSettingsView";
export { CustomizeSettingsView } from "./features/agent-definitions/CustomizeSettingsView";
export { MemorySettingsView } from "./features/agent-memory/MemorySettingsView";
export { ComputerUseSettingsView } from "./features/computer-use/ComputerUseSettingsView";
