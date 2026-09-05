import type { AgentMessage } from "../../../../../domains/agent/chat/agentChatTypes";
import type { AgentToolResultMap } from "./helpers";

/** A transcript message paired with tool results rendered in its assistant turn. */
export type DisplayMessage = {
  message: AgentMessage;
  mergedToolResults: AgentToolResultMap;
  isStreaming: boolean;
};

type ToolCallOwner = {
  messageId: string;
};

/** Merges tool results into their owning assistant messages for transcript rendering. */
export function buildDisplayMessages(source: AgentMessage[]): DisplayMessage[] {
  const toolCallOwners = new Map<string, ToolCallOwner>();
  const resultsByAssistantMessageId = new Map<string, AgentToolResultMap>();
  const mergedResultIds = new Set<string>();

  for (const message of source) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === "toolCall" && !toolCallOwners.has(block.id)) {
        toolCallOwners.set(block.id, { messageId: message.id });
      }
    }
  }

  for (const message of source) {
    if (message.role !== "toolResult" || !message.toolCallId) continue;
    const toolCallOwner = toolCallOwners.get(message.toolCallId);
    if (!toolCallOwner || mergedResultIds.has(message.id)) continue;
    const mergedResults = resultsByAssistantMessageId.get(toolCallOwner.messageId) ?? {};
    if (mergedResults[message.toolCallId]) continue;
    mergedResults[message.toolCallId] = message;
    resultsByAssistantMessageId.set(toolCallOwner.messageId, mergedResults);
    mergedResultIds.add(message.id);
  }

  return source.flatMap((message) => {
    if (shouldHideMessage(message) || mergedResultIds.has(message.id)) return [];
    return [{ message, mergedToolResults: resultsByAssistantMessageId.get(message.id) ?? {}, isStreaming: false }];
  });
}

function hasRenderableAssistantContent(message: AgentMessage): boolean {
  if (message.role !== "assistant" || !Array.isArray(message.content)) return false;
  return message.content.some((block) => {
    switch (block.type) {
      case "text":
        return block.text.trim().length > 0;
      case "thinking":
        return block.thinking.trim().length > 0;
      case "toolCall":
        return true;
    }
  });
}

function shouldHideMessage(message: AgentMessage): boolean {
  if (
    message.role === "assistant" &&
    message.stopReason === "error" &&
    typeof message.errorMessage === "string" &&
    message.errorMessage.trim().length > 0 &&
    !hasRenderableAssistantContent(message)
  ) {
    return true;
  }
  return message.role === "custom" && message.display === false;
}
