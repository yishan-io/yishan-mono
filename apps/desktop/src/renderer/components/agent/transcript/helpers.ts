import type { AgentContentBlock, AgentMessage } from "../../../store/agentChatTypes";

/** Tool-call result messages merged into assistant tool-call cards by tool call id. */
export type AgentToolResultMap = Record<string, AgentMessage | undefined>;

/** Extracts plain text from message content regardless of string or block format. */
export function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join("\n");
}

function isTextContentBlock(block: unknown): block is Extract<AgentContentBlock, { type: "text" }> {
  return (
    typeof block === "object" &&
    block !== null &&
    !Array.isArray(block) &&
    "type" in block &&
    "text" in block &&
    block.type === "text" &&
    typeof block.text === "string"
  );
}
