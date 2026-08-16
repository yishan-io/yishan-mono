/**
 * AgentCommands — the public command surface for the AgentSession feature.
 *
 * Phase 1 contract. Owned by `agentChatCommands` (Pi session lifecycle),
 * `agentCommands` (agent kind/model detection), and `chatCommands` (legacy
 * chat surface) today; moves to `features/agent/commands/` in Phase 5.
 */
import type * as agentChatCommands from "./agentChatCommands";
import type * as agentCommands from "./agentCommands";
import type * as chatCommands from "./chatCommands";

export type AgentCommands = {
  ensurePiSession: typeof agentChatCommands.ensurePiSession;
  findTabWithSession: typeof agentChatCommands.findTabWithSession;
  clearPiSessionHandle: typeof agentChatCommands.clearPiSessionHandle;
  reattachPiSession: typeof agentChatCommands.reattachPiSession;
  stopPiSession: typeof agentChatCommands.stopPiSession;
  sendAgentPrompt: typeof agentChatCommands.sendAgentPrompt;
  abortAgent: typeof agentChatCommands.abortAgent;
  compactAgent: typeof agentChatCommands.compactAgent;
  respondToAgentExtensionUiRequest: typeof agentChatCommands.respondToAgentExtensionUiRequest;
  fetchAgentModels: typeof agentChatCommands.fetchAgentModels;
  fetchAgentState: typeof agentChatCommands.fetchAgentState;
  fetchAgentMessages: typeof agentChatCommands.fetchAgentMessages;
  listAgentDetectionStatuses: typeof agentCommands.listAgentDetectionStatuses;
  listAgentModels: typeof agentCommands.listAgentModels;
  ensureChatSession: typeof chatCommands.ensureChatSession;
  runChatPrompt: typeof chatCommands.runChatPrompt;
  closeAgentSession: typeof chatCommands.closeAgentSession;
  getChatMessages: typeof chatCommands.getChatMessages;
  appendChatMessages: typeof chatCommands.appendChatMessages;
  updateChatMessage: typeof chatCommands.updateChatMessage;
  setChatAvailableCommands: typeof chatCommands.setChatAvailableCommands;
  setChatAvailableModels: typeof chatCommands.setChatAvailableModels;
  setChatCurrentModel: typeof chatCommands.setChatCurrentModel;
  createWorkspaceChatEventHandler: typeof chatCommands.createWorkspaceChatEventHandler;
};
