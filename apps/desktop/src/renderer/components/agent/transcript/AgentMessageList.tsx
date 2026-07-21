import { Box, CircularProgress, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentContentBlock, AgentMessage as AgentMessageType } from "../../../store/agentChatTypes";
import type { CompletedSubagentOpenTarget } from "../tool-calls/helpers";
import { AgentMessage } from "./AgentMessage";
import type { AgentToolResultMap } from "./helpers";

const EMPTY_MIN_HEIGHT = 320;
const BOTTOM_SCROLL_THRESHOLD_PX = 48;

const savedScrollTopByTabId = new Map<string, number>();
const savedRenderedItemCountByTabId = new Map<string, number>();
const wasPinnedToBottomByTabId = new Map<string, boolean>();

type AgentMessageListProps = {
  tabId: string;
  isActive: boolean;
  messages: AgentMessageType[];
  trailingMessage?: AgentMessageType | null;
  emptyPrompt: string;
  workspacePath?: string;
  isWorking?: boolean;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
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
      message.toolName === "write" ||
      message.toolName === "grep" ||
      message.toolName === "Agent" ||
      message.toolName === "memory_search" ||
      message.toolName === "memory_store" ||
      message.toolName === "ask_user") &&
    hasToolCall(previous.message, message.toolCallId)
  );
}

function isScrolledNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_SCROLL_THRESHOLD_PX;
}

function hasRenderableAssistantContent(message: AgentMessageType): boolean {
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return false;
  }

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

function shouldHideAssistantErrorMessage(message: AgentMessageType): boolean {
  return (
    message.role === "assistant" &&
    message.stopReason === "error" &&
    typeof message.errorMessage === "string" &&
    message.errorMessage.trim().length > 0 &&
    !hasRenderableAssistantContent(message)
  );
}

function shouldHideMessage(message: AgentMessageType): boolean {
  if (shouldHideAssistantErrorMessage(message)) {
    return true;
  }

  if (message.role === "custom") {
    return message.display === false;
  }

  return false;
}

function AgentMessageListComponent({
  tabId,
  isActive,
  messages,
  trailingMessage = null,
  emptyPrompt,
  workspacePath,
  isWorking = false,
  onOpenCompletedSubagent,
}: AgentMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(false);
  const hasRenderedTranscriptRef = useRef(false);
  const displayMessages = useMemo(() => {
    const source = trailingMessage ? [...messages, trailingMessage] : messages;
    return source.reduce<DisplayMessage[]>((acc, message, index) => {
      if (shouldHideMessage(message)) {
        return acc;
      }

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
  const renderedItemCount = displayMessages.length + (isWorking ? 1 : 0);
  const previousRenderedItemCountRef = useRef(renderedItemCount);

  const updateSavedScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    savedScrollTopByTabId.set(tabId, element.scrollTop);
    savedRenderedItemCountByTabId.set(tabId, renderedItemCount);
    wasPinnedToBottomByTabId.set(tabId, isScrolledNearBottom(element));
  }, [renderedItemCount, tabId]);

  const scrollToLatestMessage = useCallback(() => {
    const element = scrollRef.current;
    if (!element || renderedItemCount === 0) {
      return;
    }

    bottomSentinelRef.current?.scrollIntoView?.({ block: "end" });
    element.scrollTop = element.scrollHeight;
  }, [renderedItemCount]);

  useEffect(() => {
    const element = scrollRef.current;
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;

    if (wasActive && !isActive && element) {
      savedScrollTopByTabId.set(tabId, element.scrollTop);
      savedRenderedItemCountByTabId.set(tabId, renderedItemCount);
      wasPinnedToBottomByTabId.set(tabId, isScrolledNearBottom(element));
      return;
    }

    if (!isActive || wasActive || !element) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToLatestMessage();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isActive, renderedItemCount, scrollToLatestMessage, tabId]);

  useEffect(() => {
    if (displayMessages.length === 0) {
      return;
    }

    const isInitialTranscriptRender = !hasRenderedTranscriptRef.current;
    hasRenderedTranscriptRef.current = true;
    if (!isInitialTranscriptRender && !(wasPinnedToBottomByTabId.get(tabId) ?? true)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToLatestMessage();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayMessages.length, scrollToLatestMessage, tabId]);

  useEffect(() => {
    const previousRenderedItemCount = previousRenderedItemCountRef.current;
    previousRenderedItemCountRef.current = renderedItemCount;

    if (!isActive || renderedItemCount === 0 || renderedItemCount === previousRenderedItemCount) {
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
  }, [isActive, renderedItemCount, scrollToLatestMessage, tabId]);

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
      data-testid="agent-message-scroll-container"
      onScroll={updateSavedScrollState}
      sx={{
        flex: 1,
        minHeight: 0,
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
            onOpenCompletedSubagent={onOpenCompletedSubagent}
          />
        ))}
        {isWorking && (
          <Box
            data-testid="agent-turn-working-indicator"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 1,
              color: "text.secondary",
            }}
          >
            <CircularProgress size={14} thickness={5} />
            <Typography variant="caption" color="inherit">
              working…
            </Typography>
          </Box>
        )}
        <Box ref={bottomSentinelRef} aria-hidden sx={{ height: 1, flexShrink: 0 }} />
      </Box>
    </Box>
  );
}

const MemoizedAgentMessageList = memo(AgentMessageListComponent);
MemoizedAgentMessageList.displayName = "AgentMessageList";

/** Renders the agent chat message list with preserved scroll state across tab switches. */
export const AgentMessageList = MemoizedAgentMessageList;
