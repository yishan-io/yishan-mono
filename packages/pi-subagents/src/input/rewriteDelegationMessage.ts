import type { UserMessage } from "@earendil-works/pi-ai";

import { buildDelegationPrompt } from "./delegationPrompt";
import { parseAgentInvocation } from "./invocationParser";

/**
 * Rewrites one visible `@agent:` shorthand user message into the hidden delegation prompt used in LLM context.
 */
export function rewriteDelegationMessage(message: UserMessage, knownAgentNames: string[]): UserMessage {
  if (typeof message.content === "string") {
    const parsedInvocation = parseAgentInvocation(message.content, knownAgentNames);
    if (!parsedInvocation || parsedInvocation.kind !== "invocation") {
      return message;
    }

    return {
      ...message,
      content: buildDelegationPrompt(parsedInvocation.invocation),
    };
  }

  const textContent = message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  const parsedInvocation = parseAgentInvocation(textContent, knownAgentNames);
  if (!parsedInvocation || parsedInvocation.kind !== "invocation") {
    return message;
  }

  const imageContent = message.content.filter((item) => item.type === "image");
  return {
    ...message,
    content: [{ type: "text", text: buildDelegationPrompt(parsedInvocation.invocation) }, ...imageContent],
  };
}
