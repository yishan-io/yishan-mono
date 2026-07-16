import type { AgentContentBlock, AgentMessage, AgentStreamEvent } from "../store/agentChatTypes";

export function cloneContentBlock(block: AgentContentBlock): AgentContentBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "thinking":
      return {
        type: "thinking",
        thinking: block.thinking,
        thinkingSignature:
          typeof block.thinkingSignature === "string"
            ? block.thinkingSignature
            : block.thinkingSignature
              ? {
                  ...block.thinkingSignature,
                  summary: block.thinkingSignature.summary?.map((summaryItem) => ({ ...summaryItem })),
                }
              : undefined,
      };
    case "toolCall":
      return {
        type: "toolCall",
        id: block.id,
        name: block.name,
        arguments: { ...block.arguments },
      };
  }
}

export function cloneContentBlocks(content: AgentContentBlock[]): AgentContentBlock[] {
  return content.map(cloneContentBlock);
}

export function cloneAgentMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    content: Array.isArray(message.content) ? cloneContentBlocks(message.content) : message.content,
  };
}

export function applyStreamDelta(message: AgentMessage, delta: AgentStreamEvent): void {
  const content: AgentContentBlock[] = Array.isArray(message.content) ? cloneContentBlocks(message.content) : [];

  const ensureIndex = (idx: number, block: AgentContentBlock): void => {
    while (content.length <= idx) {
      content.push({ type: "text", text: "" });
    }
    content[idx] = block;
  };

  switch (delta.type) {
    case "text_start":
      content.push({ type: "text", text: "" });
      break;

    case "text_delta": {
      const block = content[delta.contentIndex];
      if (block && block.type === "text") {
        block.text += delta.delta;
      } else {
        ensureIndex(delta.contentIndex, { type: "text", text: delta.delta });
      }
      break;
    }

    case "thinking_start":
      content.push({ type: "thinking", thinking: "" });
      break;

    case "thinking_delta": {
      const block = content[delta.contentIndex];
      if (block && block.type === "thinking") {
        block.thinking += delta.delta;
      } else {
        ensureIndex(delta.contentIndex, { type: "thinking", thinking: delta.delta });
      }
      break;
    }

    case "toolcall_start":
      content.push({
        type: "toolCall",
        id: delta.toolCallId,
        name: delta.toolName,
        arguments: {},
      });
      break;

    case "toolcall_delta":
      // Pi streams tool-call arguments as incremental JSON fragments. Wait for
      // toolcall_end, which carries the complete parsed arguments object.
      break;

    case "toolcall_end": {
      const block = content[delta.contentIndex];
      if (block && block.type === "toolCall" && delta.toolCall) {
        block.arguments = delta.toolCall.arguments;
      }
      break;
    }
  }

  message.content = content;
}
