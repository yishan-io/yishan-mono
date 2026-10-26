import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import { displaySettingsStore } from "@renderer/domains/settings";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown } from "react-icons/lu";
import type { AgentQueueState } from "../../../chat/agentChatTypes";
import type { TranscriptDisplay } from "../../../chat/transcript/presentation.types";
import { AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX } from "../chat/AgentChatContentLayout";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentChatEmptyState } from "./AgentChatEmptyState";
import { QueuedMessageList } from "./QueuedMessageList";
import { VirtualTranscriptRows } from "./VirtualTranscriptRows";

const BOTTOM_SCROLL_THRESHOLD_PX = 48;
const MESSAGE_ESTIMATED_HEIGHT_PX = 180;
const MESSAGE_VIRTUALIZER_OVERSCAN = 5;

const savedScrollTopByTabId = new Map<string, number>();
const savedRenderedItemCountByTabId = new Map<string, number>();
const wasPinnedToBottomByTabId = new Map<string, boolean>();

type AgentMessageListProps = {
  tabId: string;
  isActive: boolean;
  presentation: TranscriptDisplay;
  workspacePath?: string;
  isWorking?: boolean;
  workingLabel?: string;
  queuedMessages?: AgentQueueState;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
  /** Short hints shown below the empty-state logo to help users learn the system. */
  emptyHelpLines?: string[];
  /** Prefix label rendered before the empty-state hint (e.g. "Tip:"). */
  emptyHelpPrefix?: string;
};

function isScrolledNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_SCROLL_THRESHOLD_PX;
}

function AgentMessageListComponent({
  tabId,
  isActive,
  presentation,
  workspacePath,
  isWorking = false,
  workingLabel,
  queuedMessages,
  onOpenCompletedSubagent,
  emptyHelpLines,
  emptyHelpPrefix,
}: AgentMessageListProps) {
  const agentChatWidth = displaySettingsStore((state) => state.agentChatWidth);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(false);
  const hasRenderedTranscriptRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const rows = presentation.rows;
  const rowIdsRef = useRef<string[]>([]);
  rowIdsRef.current = rows.map((row) => (row.kind === "turn" ? row.turn.id : row.id));
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
    if (!isProgrammaticScroll && rows.length > 0) {
      setIsScrollToBottomVisible(!isScrolledNearBottom(element));
    }
  }, [rows.length, renderedItemCount, tabId]);
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
    if (presentation.rows.length === 0) {
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
  }, [presentation, scrollToLatestMessage, tabId, isActive]);

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

  if (rows.length === 0 && queuedCount === 0) {
    return <AgentChatEmptyState helpLines={emptyHelpLines} helpPrefix={emptyHelpPrefix} />;
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
      <Box
        ref={scrollRef}
        data-testid="agent-message-scroll-container"
        onScroll={updateSavedScrollState}
        sx={{
          height: "100%",
          width: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          px: 2,
          py: 1,
        }}
      >
        <Box
          data-testid="agent-message-list-content"
          sx={{
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            gap: 1,
            ...(agentChatWidth === "fixed"
              ? {
                  maxWidth: AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX,
                  mx: "auto",
                  width: "100%",
                }
              : {}),
          }}
        >
          <VirtualTranscriptRows
            rows={rows}
            virtualMessages={virtualMessages}
            totalSize={virtualMessageTotalSize}
            measureElement={virtualizer.measureElement}
            workspacePath={workspacePath}
            onOpenCompletedSubagent={onOpenCompletedSubagent}
          />
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
      {isScrollToBottomVisible && rows.length > 0 && (
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
