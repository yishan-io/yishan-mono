/**
 * chat module — internal module API (desktop9).
 */
export type {
  AgentSessionState,
  AgentCompactionReason,
  AgentPendingUiOption,
  AgentPendingUiRequest,
  AgentPendingUiAutoResponse,
  AgentSubagentCancelState,
  AgentThinkingSignatureSummary,
  AgentThinkingSignature,
  AgentContentBlock,
  AgentMessage,
  AgentModel,
  AgentStreamEvent,
  AgentSessionStats,
  AgentQueueState,
} from "./agentChatTypes";
export { isAgentSessionBusy } from "./agentChatTypes";
export type { ChatMessage, AvailableCommand, AvailableModel } from "./chatTypes";
export {
  PER_MESSAGE_UTF8_BYTES,
  MAX_DETAILS_DEPTH,
  MAX_DETAILS_ITEMS,
  MAX_DETAILS_STRING_UTF8_BYTES,
  MAX_PER_TAB_AGGREGATE_UTF8_BYTES,
  MAX_SUBAGENT_CHILDREN,
  MAX_SUBAGENT_MESSAGES_PER_CHILD,
  MAX_SUBAGENT_AGGREGATE_UTF8_BYTES,
  countMessageUtf8Bytes,
} from "./agentChatBudget";
export { MAX_MESSAGES_PER_TAB, trimSessionMessages, trimSubagentLiveTranscripts } from "./agentChatRetention";
export type {
  AgentSubagentLifecycleEvent,
  AgentSubagentLifecycleDetails,
  RunningSubagentSummary,
  ChildSessionSubagentMetadata,
} from "./agentChatSubagents";
export {
  findMatchingRunningSubagent,
  parseSubagentLifecycleMessage,
  deriveChildSessionSubagentMetadata,
  deriveFinishedSubagents,
  deriveRunningSubagents,
} from "./agentChatSubagents";
export type { AgentChatUsageSummary } from "./agentChatUsageSummary";
export { buildAgentChatUsageSummary, getCompactContextPercent, roundContextPercent } from "./agentChatUsageSummary";
