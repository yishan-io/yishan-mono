/**
 * Agent feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, agent chat models, and public state
 * surfaces. Internal Stores and Runtime implementations are not exported.
 *
 * Ordering constraint (desktop7 Phase 21): the leaf `model/agentSettings`
 * re-export must stay FIRST. The Agent enablement store
 * (`state/agentSettingsStore`) imports this module and calls
 * `createDefaultAgentInUseByKind` at evaluation time, and Agent features
 * import the settings index back (eval cycle). A mid-cycle importer can read
 * the binding only after this statement executes; moving it later re-triggers
 * `createDefaultAgentInUseByKind is not a function`.
 */
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

export type { AgentCommands } from "./commands/contract";
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
export {
  recordWorkspaceUnreadNotification,
  removeTabData,
  removeWorkspaceTaskCounts,
  setWorkspaceAgentStatusByWorkspaceId,
  markWorkspaceNotificationsRead,
} from "./state/chatActions";
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
  buildModelPickerOption,
  groupModelPickerOptionsByProvider,
  splitModelId,
  stripProviderPrefix,
  type ModelPickerOption,
} from "./features/select-model";
export { ProviderMark } from "./ui/ProviderMark";
export {
  useWorkspaceAgentStatusByWorkspaceId,
  useWorkspaceUnreadToneByWorkspaceId,
} from "./hooks/useAgentChatReadHooks";
export { findTabWithSession, renameAgentChatSessionByTab, stopPiSession } from "./commands/agentChatCommands";
export { fetchAgentSessionFilePath, listActivePiSessions } from "./commands/agentChatSessionHistory";
export { ProviderCredentialDialog } from "./ui/credentials/ProviderCredentialDialog";
// Agent enablement preferences owned by Agent, consumed by the Settings CLI
// feature through the public API (desktop7 Phase 21 — moved from Settings so
// the settings→agent edge never evaluates this store mid-cycle).
export { AGENT_SETTINGS_STORE_STORAGE_KEY, agentSettingsStore } from "./state/agentSettingsStore";
export { useAgentKindsInUse } from "./hooks/useAgentKindsInUse";
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
export {
  addSkill,
  getSkillDetail,
  listSkills,
  removeSkill,
  updateSkill,
  updateAllSkills,
} from "./commands/agentSkillCommands";
export {
  createAgentDefinition,
  getAgentDefinitionDetail,
  installExtension,
  listAgentDefinitions,
  listExtensions,
  removeAgentDefinition,
  removeExtension,
  restoreAgentDefinition,
  updateAgentDefinition,
  updateExtension,
} from "./commands/agentDefinitionCommands";
export {
  checkAgentGlobalConfigExternalDirectoryPermission,
  ensureAgentGlobalConfigExternalDirectoryPermission,
  getComputerUsePermissions,
  getMemoryConfig,
  listAgentModelsForMemorySettings,
  openComputerUsePermissionSettings,
  updateMemoryConfig,
} from "./commands/agentConfigCommands";

// Agent administration UI composed by the Settings shell (desktop7 Phase 23).
export { AgentProviderSettingsView } from "./features/manage-providers/AgentProviderSettingsView";
export { SkillsSettingsView } from "./features/manage-skills/SkillsSettingsView";
export { CustomizeSettingsView } from "./features/agent-definitions/CustomizeSettingsView";
export { MemorySettingsView } from "./features/agent-memory/MemorySettingsView";
export { ComputerUseSettingsView } from "./features/computer-use/ComputerUseSettingsView";
