import { Box, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentContentBlock, AgentMessage as AgentMessageType } from "../../store/agentChatTypes";
import { AgentMessage, type AgentToolResultMap } from "./AgentMessage";

const EMPTY_MIN_HEIGHT = 320;
const ESTIMATED_MESSAGE_HEIGHT_PX = 160;
const MESSAGE_LIST_OVERSCAN = 6;

type AgentMessageListProps = {
  messages: AgentMessageType[];
  trailingMessage?: AgentMessageType | null;
  emptyPrompt: string;
  workspacePath?: string;
};

type DisplayMessage = {
  message: AgentMessageType;
  mergedToolResults: AgentToolResultMap;
  isStreaming: boolean;
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
    message.role === "toolResult" &&
    (message.toolName === "bash" ||
      message.toolName === "read" ||
      message.toolName === "edit" ||
      message.toolName === "write") &&
    hasToolCall(previous.message, message.toolCallId)
  );
}

function AgentMessageListComponent({
  messages,
  trailingMessage = null,
  emptyPrompt,
  workspacePath,
}: AgentMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const displayMessages = useMemo(() => {
    const source = trailingMessage ? [...messages, trailingMessage] : messages;
    return source.reduce<DisplayMessage[]>((acc, message, index) => {
      const previous = acc[acc.length - 1];
      if (previous && shouldMergeToolResult(message, previous)) {
        previous.mergedToolResults[message.toolCallId as string] = message;
        return acc;
      }
      acc.push({
        message,
        mergedToolResults: {},
        isStreaming: trailingMessage !== null && index === source.length - 1,
      });
      return acc;
    }, []);
  }, [messages, trailingMessage]);

  const rowVirtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => displayMessages[index]?.message.id ?? index,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
    overscan: MESSAGE_LIST_OVERSCAN,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const updateViewportHeight = () => {
      setViewportHeight(element.clientHeight);
    };

    updateViewportHeight();

    if (typeof ResizeObserver !== "function") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateViewportHeight();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || displayMessages.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(displayMessages.length - 1, { align: "end" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayMessages.length, rowVirtualizer]);

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

  const totalHeight = rowVirtualizer.getTotalSize();
  const contentHeight = Math.max(totalHeight, viewportHeight);
  const verticalOffset = Math.max(0, contentHeight - totalHeight);

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
      <Box sx={{ height: contentHeight, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const displayMessage = displayMessages[virtualItem.index];
          if (!displayMessage) {
            return null;
          }

          const { message, mergedToolResults, isStreaming } = displayMessage;

          return (
            <Box
              key={virtualItem.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${verticalOffset + virtualItem.start}px)`,
              }}
            >
              <AgentMessage
                message={message}
                mergedToolResults={mergedToolResults}
                workspacePath={workspacePath}
                isStreaming={isStreaming}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

const MemoizedAgentMessageList = memo(AgentMessageListComponent);
MemoizedAgentMessageList.displayName = "AgentMessageList";

/** Renders the agent chat message list with virtualization for large transcripts. */
export const AgentMessageList = MemoizedAgentMessageList;
