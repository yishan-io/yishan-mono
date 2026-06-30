import { Box, Typography } from "@mui/material";
import { useEffect, useMemo, useRef } from "react";
import type { AgentContentBlock, AgentMessage as AgentMessageType } from "../../store/agentChatTypes";
import { AgentMessage, type AgentToolResultMap } from "./AgentMessage";

const EMPTY_MIN_HEIGHT = 320;

type AgentMessageListProps = {
  messages: AgentMessageType[];
  trailingMessage?: AgentMessageType | null;
  emptyPrompt: string;
};

type DisplayMessage = {
  message: AgentMessageType;
  mergedToolResults: AgentToolResultMap;
};

function hasToolCall(message: AgentMessageType, toolCallId: string | undefined): boolean {
  if (!toolCallId || message.role !== "assistant" || !Array.isArray(message.content)) {
    return false;
  }
  return message.content.some(
    (block): block is Extract<AgentContentBlock, { type: "toolCall" }> =>
      block.type === "toolCall" && block.id === toolCallId,
  );
}

function shouldMergeToolResult(message: AgentMessageType, previous: DisplayMessage | undefined): boolean {
  if (!previous) {
    return false;
  }
  return (
    message.role === "toolResult" && message.toolName === "bash" && hasToolCall(previous.message, message.toolCallId)
  );
}

/** Renders the agent chat message list without virtualization to support dynamic row heights safely. */
export function AgentMessageList({ messages, trailingMessage = null, emptyPrompt }: AgentMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayMessages = useMemo(() => {
    const source = trailingMessage ? [...messages, trailingMessage] : messages;
    return source.reduce<DisplayMessage[]>((acc, message) => {
      const previous = acc[acc.length - 1];
      if (previous && shouldMergeToolResult(message, previous)) {
        previous.mergedToolResults[message.toolCallId as string] = message;
        return acc;
      }
      acc.push({ message, mergedToolResults: {} });
      return acc;
    }, []);
  }, [messages, trailingMessage]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || displayMessages.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayMessages]);

  if (displayMessages.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          px: 2,
          py: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: EMPTY_MIN_HEIGHT,
        }}
      >
        <Typography color="text.secondary">{emptyPrompt}</Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={scrollRef}
      sx={{
        flex: 1,
        overflow: "auto",
        px: 2,
        py: 1,
      }}
    >
      <Box
        sx={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 1,
        }}
      >
        {displayMessages.map(({ message, mergedToolResults }) => (
          <AgentMessage key={message.id} message={message} mergedToolResults={mergedToolResults} />
        ))}
      </Box>
    </Box>
  );
}
