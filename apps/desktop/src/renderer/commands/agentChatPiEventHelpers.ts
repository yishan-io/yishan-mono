// Compatibility facade for the split Pi-event modules.
//
// The Pi-event implementation moved to two files:
//   - agentChatPiEventShared.ts: stream buffering, message-delta parsing,
//     Pi response handling, session-stat helpers, and model commands.
//   - agentChatPiEventHandler.ts: PiEventPayload and handleAgentPiEvent.
// This file re-exports the original public surface so existing callers
// (agentChatCommands.ts, agentChatEventRouter.ts) keep working unchanged.

export {
  clearAgentChatSessionStatsSequence,
  cloneIncomingAgentMessage,
  getLatestStreamingMessage,
  handlePiResponse,
  invalidateAgentSessionStats,
  parseAgentStreamEvent,
  parsePendingUiRequest,
  queueStreamingMessageUpdate,
  refreshAgentSessionStats,
  registerAgentSession,
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "./agentChatPiEventShared";
export { handleAgentPiEvent } from "./agentChatPiEventHandler";
export type { PiEventPayload } from "./agentChatPiEventHandler";
