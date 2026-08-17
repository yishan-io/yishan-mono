/**
 * Agent feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, agent chat models, and public state
 * surfaces. Internal Stores and Runtime implementations are not exported.
 */
export type { AgentCommands } from "./commands/contract";
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
// Agent event-pipeline entry points required by cross-feature composition.
// Re-exported through the public API instead of the events module (Phase 17).
export {
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "./events/agentChatPiEventShared";
