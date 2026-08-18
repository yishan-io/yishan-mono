import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown } from "react-icons/lu";
import type { AgentMessage as AgentMessageType, AgentQueueState } from "../../../../domains/agent/model/agentChatTypes";
import type { CompletedSubagentOpenTarget } from "../tool-calls/helpers";
import { AgentChatEmptyState } from "./AgentChatEmptyState";
import { AgentTurn } from "./AgentTurn";
import { QueuedMessageList } from "./QueuedMessageList";
import { UserMessageRow } from "./UserMessageRow";
import type { AgentToolResultMap } from "./helpers";
import { buildTranscriptRows } from "./turnModel";

const BOTTOM_SCROLL_THRESHOLD_PX = 48;const MESSAGE_ESTIMATED_HEIGHT_PX = 180;
const MESSAGE_VIRTUALIZER_OVERSCAN = 5;

const savedScrollTopByTabId = new Map<string, number>();
const savedRenderedItemCountByTabId = new Map<string, number>();
const wasPinnedToBottomByTabId = new Map<string, boolean>();

type AgentMessageListProps = {
  tabId: string;
  isActive: boolean;
  messages: AgentMessageType[];
  trailingMessage?: AgentMessageType | null;
  workspacePath?: string;
  isWorking?: boolean;
  workingLabel?: string;
  /** Whether the session is actively running a turn (not compacting); keeps the last turn's header as the single working indicator. */
  isTurnRunning?: boolean;
  queuedMessages?: AgentQueueState;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
  /** Short hints shown below the empty-state logo to help users learn the system. */
  emptyHelpLines?: string[];
  /** Prefix label rendered before the empty-state hint (e.g. "Tip:"). */
  emptyHelpPrefix?: string;
};

type DisplayMessage = {
  message: AgentMessageType;
  mergedToolResults: AgentToolResultMap;
  isStreaming: boolean;
};

type ToolCallOwner = {
  messageId: string;
};

function buildDisplayMessages(source: AgentMessageType[]): DisplayMessage[] {
  const toolCallOwners = new Map<string, ToolCallOwner>();
  const resultsByAssistantMessageId = new Map<string, AgentToolResultMap>();
  const mergedResultIds = new Set<string>();

  for (const message of source) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content) {
      if (block.type === "toolCall" && !toolCallOwners.has(block.id)) {
        toolCallOwners.set(block.id, { messageId: message.id });
      }
    }
  }

  for (const message of source) {
    if (message.role !== "toolResult" || !message.toolCallId) {
      continue;
    }

    const toolCallOwner = toolCallOwners.get(message.toolCallId);
    if (!toolCallOwner || mergedResultIds.has(message.id)) {
      continue;
    }

    const mergedResults = resultsByAssistantMessageId.get(toolCallOwner.messageId) ?? {};
    if (mergedResults[message.toolCallId]) {
      continue;
    }

    mergedResults[message.toolCallId] = message;
    resultsByAssistantMessageId.set(toolCallOwner.messageId, mergedResults);
    mergedResultIds.add(message.id);
  }

  return source.flatMap((message) => {
    if (shouldHideMessage(message) || mergedResultIds.has(message.id)) {
      return [];
    }

    return [
      {
        message,
        mergedToolResults: resultsByAssistantMessageId.get(message.id) ?? {},
        isStreaming: false,
      },
    ];
  });
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
  workspacePath,
  isWorking = false,
  workingLabel,
  isTurnRunning = false,
  queuedMessages,
  onOpenCompletedSubagent,
  emptyHelpLines,
  emptyHelpPrefix,
}: AgentMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(false);
  const hasRenderedTranscriptRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const displayMessages = useMemo(() => {
    const source = trailingMessage ? [...messages, trailingMessage] : messages;
    const display = buildDisplayMessages(source);
    if (trailingMessage) {
      const trailingDisplayMessage = display.find((displayMessage) => displayMessage.message.id === trailingMessage.id);
      if (trailingDisplayMessage) {
        trailingDisplayMessage.isStreaming = true;
      }
    }
    return display;
  }, [messages, trailingMessage]);
  const rows = useMemo(() => buildTranscriptRows(displayMessages, isTurnRunning), [displayMessages, isTurnRunning]);
  const rowIdsRef = useRef<string[]>([]);
  rowIdsRef.current = rows.map((row) => (row.kind === "user" ? `user:${row.message.id}` : row.turn.id));
  const getVirtualMessageKey = useCallback((index: number) => rowIdsRef.current[index] ?? index, []);
  const queuedCount = (queuedMessages?.steering.length ?? 0) + (queuedMessages?.followUp.length ?? 0);
  const hasWorkingTurn = rows.some((row) => row.kind === "turn" && row.turn.isWorking);
  const renderedItemCount = rows.length + (isWorking && !hasWorkingTurn ? 1 : 0) + queuedCount;
  const previousRenderedItemCountRef = useRef(renderedItemCount);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => MESSAGE_ESTIMATED_HEIGHT_PX,
    overscan: MESSAGE_VIRTUALIZER_OVERSCAN,
    getItemKey: getVirtualMessageKey,
  });
  const virtualMessages = virtualizer.getVirtualItems();
  const virtualMessageTotalSize = virtualizer.getTotalSize();
  const { t } = useTranslation();
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);

  const updateSavedScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    savedScrollTopByTabId.set(tabId, element.scrollTop);
    savedRenderedItemCountByTabId.set(tabId, renderedItemCount);

    const isProgrammaticScroll = programmaticScrollRef.current;
    programmaticScrollRef.current = false;
    // A programmatic scroll-to-bottom can land short of the true bottom while
    // virtual rows are still unmeasured (estimate-sized); evaluating
    // isScrolledNearBottom against the later re-measured scrollHeight would
    // poison the pinned flag and stop the follow-scroll. Treat it as a pin.
    if (isProgrammaticScroll) {
      wasPinnedToBottomByTabId.set(tabId, true);
    } else {
      wasPinnedToBottomByTabId.set(tabId, isScrolledNearBottom(element));
    }

    // Programmatic pins always land at the bottom, so they never drive the
    // scroll-to-bottom button; only user scrolls do.
    if (!isProgrammaticScroll && displayMessages.length > 0) {
      setIsScrollToBottomVisible(!isScrolledNearBottom(element));
    }
  }, [displayMessages.length, renderedItemCount, tabId]);
  const scrollToLatestMessage = useCallback(() => {
    const element = scrollRef.current;
    if (!element || renderedItemCount === 0) {
      return;
    }

    // Already at the exact bottom: scrolling is a no-op, so no scroll event
    // will fire to consume the programmatic marker. Skip entirely — leaving the
    // marker set would misattribute the next user scroll as programmatic, and
    // clearing it here would break the same-frame case where an earlier scroll
    // that DID move still needs its own marker for the event it will dispatch.
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (element.scrollTop >= maxScrollTop - 1) {
      wasPinnedToBottomByTabId.set(tabId, true);
      return;
    }

    programmaticScrollRef.current = true;
    wasPinnedToBottomByTabId.set(tabId, true);
    bottomSentinelRef.current?.scrollIntoView?.({ block: "end" });
    element.scrollTop = element.scrollHeight;
  }, [renderedItemCount, tabId]);

  const handleScrollToBottomClick = useCallback(() => {
    scrollToLatestMessage();
    setIsScrollToBottomVisible(false);
  }, [scrollToLatestMessage]);

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
      setIsScrollToBottomVisible(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isActive, renderedItemCount, scrollToLatestMessage, tabId]);

  useEffect(() => {
    if (displayMessages.length === 0) {
      setIsScrollToBottomVisible(false);
      return;
    }

    const isInitialTranscriptRender = !hasRenderedTranscriptRef.current;
    hasRenderedTranscriptRef.current = true;
    if (!isActive) {
      return;
    }
    if (!isInitialTranscriptRender && !(wasPinnedToBottomByTabId.get(tabId) ?? true)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToLatestMessage();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayMessages.length, scrollToLatestMessage, tabId, isActive]);

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

  useEffect(() => {
    if (!isActive || virtualMessageTotalSize === 0 || !(wasPinnedToBottomByTabId.get(tabId) ?? true)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToLatestMessage();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isActive, scrollToLatestMessage, tabId, virtualMessageTotalSize]);

  const isInEmptyState = displayMessages.length === 0 && queuedCount === 0;

  if (isInEmptyState) {
    return <AgentChatEmptyState helpLines={emptyHelpLines} helpPrefix={emptyHelpPrefix} />;
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
      <Box
        ref={scrollRef}
        data-testid="agent-message-scroll-container"
        onScroll={updateSavedScrollState}
        sx={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
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
          <Box sx={{ height: virtualMessageTotalSize, position: "relative", width: "100%" }}>
            {virtualMessages.map((virtualMessage) => {
              const row = rows[virtualMessage.index];
              if (!row) {
                return null;
              }

              return (
                <Box
                  key={virtualMessage.key}
                  data-index={virtualMessage.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    transform: `translateY(${virtualMessage.start}px)`,
                    width: "100%",
                  }}
                >
                  {row.kind === "user" ? (
                    <UserMessageRow message={row.message} />
                  ) : (
                    <AgentTurn
                      turn={row.turn}
                      workspacePath={workspacePath}
                      onOpenCompletedSubagent={onOpenCompletedSubagent}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
          {isWorking && !hasWorkingTurn && (
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
              <Typography
                variant="caption"
                sx={{
                  color: "inherit",
                }}
              >
                {workingLabel ?? "working…"}
              </Typography>
            </Box>
          )}
          {queuedMessages && (
            <QueuedMessageList steering={queuedMessages.steering} followUp={queuedMessages.followUp} />
          )}
          <Box ref={bottomSentinelRef} aria-hidden sx={{ height: 1, flexShrink: 0 }} />
        </Box>
      </Box>
      {isScrollToBottomVisible && displayMessages.length > 0 && (
        <IconButton
          data-testid="scroll-to-bottom-button"
          aria-label={t("agentChat.scrollToBottom")}
          onClick={handleScrollToBottomClick}
          sx={{
            position: "absolute",
            bottom: 12,
            right: 12,
            zIndex: 1,
            backgroundColor: "background.paper",
            boxShadow: 2,
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        >
          <LuChevronDown size={20} />
        </IconButton>
      )}
    </Box>
  );
}

const MemoizedAgentMessageList = memo(AgentMessageListComponent);
MemoizedAgentMessageList.displayName = "AgentMessageList";

/** Renders the agent chat message list with preserved scroll state across tab switches. */
export const AgentMessageList = MemoizedAgentMessageList;
