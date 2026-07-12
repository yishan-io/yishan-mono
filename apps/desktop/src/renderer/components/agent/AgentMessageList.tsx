import { Box, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentContentBlock, AgentMessage as AgentMessageType } from "../../store/agentChatTypes";
import { AgentMessage, type AgentToolResultMap } from "./AgentMessage";

const EMPTY_MIN_HEIGHT = 320;
const BOTTOM_SCROLL_THRESHOLD_PX = 48;

const savedScrollTopByTabId = new Map<string, number>();
const savedMessageCountByTabId = new Map<string, number>();
const wasPinnedToBottomByTabId = new Map<string, boolean>();

type AgentMessageListProps = {
  tabId: string;
  isActive: boolean;
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

function isScrolledNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_SCROLL_THRESHOLD_PX;
}

function AgentMessageListComponent({
  tabId,
  isActive,
  messages,
  trailingMessage = null,
  emptyPrompt,
  workspacePath,
}: AgentMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(isActive);
  const previousMessageCountRef = useRef(messages.length + (trailingMessage ? 1 : 0));
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

  const updateSavedScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    savedScrollTopByTabId.set(tabId, element.scrollTop);
    savedMessageCountByTabId.set(tabId, displayMessages.length);
    wasPinnedToBottomByTabId.set(tabId, isScrolledNearBottom(element));
  }, [displayMessages.length, tabId]);

  const scrollToLatestMessage = useCallback(() => {
    const element = scrollRef.current;
    if (!element || displayMessages.length === 0) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [displayMessages.length]);

  useEffect(() => {
    const element = scrollRef.current;
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;

    if (wasActive && !isActive && element) {
      savedScrollTopByTabId.set(tabId, element.scrollTop);
      savedMessageCountByTabId.set(tabId, displayMessages.length);
      wasPinnedToBottomByTabId.set(tabId, isScrolledNearBottom(element));
      return;
    }

    if (!isActive || wasActive || !element) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (displayMessages.length === 0) {
        return;
      }

      const savedScrollTop = savedScrollTopByTabId.get(tabId);
      const savedMessageCount = savedMessageCountByTabId.get(tabId);
      const wasPinnedToBottom = wasPinnedToBottomByTabId.get(tabId) ?? true;

      if (savedScrollTop !== undefined) {
        if (wasPinnedToBottom && savedMessageCount !== undefined && savedMessageCount !== displayMessages.length) {
          scrollToLatestMessage();
          return;
        }

        element.scrollTop = savedScrollTop;
        return;
      }

      if (wasPinnedToBottom) {
        scrollToLatestMessage();
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayMessages.length, isActive, scrollToLatestMessage, tabId]);

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    previousMessageCountRef.current = displayMessages.length;

    if (!isActive || displayMessages.length === 0 || displayMessages.length <= previousMessageCount) {
      return;
    }

    if (!(wasPinnedToBottomByTabId.get(tabId) ?? true)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToLatestMessage();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayMessages.length, isActive, scrollToLatestMessage, tabId]);

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
      onScroll={updateSavedScrollState}
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
        {displayMessages.map(({ message, mergedToolResults, isStreaming }) => (
          <AgentMessage
            key={message.id}
            message={message}
            mergedToolResults={mergedToolResults}
            workspacePath={workspacePath}
            isStreaming={isStreaming}
          />
        ))}
      </Box>
    </Box>
  );
}

const MemoizedAgentMessageList = memo(AgentMessageListComponent);
MemoizedAgentMessageList.displayName = "AgentMessageList";

/** Renders the agent chat message list with preserved scroll state across tab switches. */
export const AgentMessageList = MemoizedAgentMessageList;
