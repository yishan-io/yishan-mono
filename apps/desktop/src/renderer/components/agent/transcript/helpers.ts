import type { AgentContentBlock, AgentMessage } from "../../../store/agentChatTypes";

/** Tool-call result messages merged into assistant tool-call cards by tool call id. */
export type AgentToolResultMap = Record<string, AgentMessage | undefined>;

/** Extracts plain text from message content regardless of string or block format. */
export function extractMessageText(content: string | AgentContentBlock[]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((block): block is Extract<AgentContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
