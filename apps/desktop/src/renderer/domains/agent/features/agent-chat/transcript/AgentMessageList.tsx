import { Box } from "@mui/material";
import { displaySettingsStore } from "@renderer/domains/settings";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentMessage as AgentMessageType,
  AgentQueueState,
} from "../../../../../domains/agent/chat/agentChatTypes";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentChatEmptyState } from "./AgentChatEmptyState";
import { AgentMessageListContent } from "./AgentMessageListContent";
import { AgentMessageScrollToBottomButton } from "./AgentMessageScrollToBottomButton";
import { buildDisplayMessages } from "./agentMessageDisplay";
import { agentMessageScrollState, isScrolledNearBottom } from "./agentMessageScrollState";
import { buildTranscriptRows } from "./turnModel";
import { useAgentMessageDelegations } from "./useAgentMessageDelegations";

const MESSAGE_ESTIMATED_HEIGHT_PX = 180;
const MESSAGE_VIRTUALIZER_OVERSCAN = 5;

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
  /** Runtime that produced this transcript. */
  runtime?: import("../../../daemon/daemonAgentTypes").AgentRuntime;
  dshDelegationLifecycleByChildSessionId?: Readonly<
    Record<string, import("../../../../../domains/agent/chat/agentChatDshDelegation").DshDelegationLifecycleState>
  >;
  /** Short hints shown below the empty-state logo to help users learn the system. */
  emptyHelpLines?: string[];
  /** Prefix label rendered before the empty-state hint (e.g. "Tip:"). */
  emptyHelpPrefix?: string;
};

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
  runtime,
  dshDelegationLifecycleByChildSessionId,
  emptyHelpLines,
  emptyHelpPrefix,
}: AgentMessageListProps) {
  const agentChatWidth = displaySettingsStore((state) => state.agentChatWidth);
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
  const { agentToolCallStates, dshDelegationStates, dshDelegationDiagnostics } = useAgentMessageDelegations(
    messages,
    trailingMessage,
    dshDelegationLifecycleByChildSessionId,
  );
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

    agentMessageScrollState.savedScrollTopByTabId.set(tabId, element.scrollTop);
    agentMessageScrollState.savedRenderedItemCountByTabId.set(tabId, renderedItemCount);

    const isProgrammaticScroll = programmaticScrollRef.current;
    programmaticScrollRef.current = false;
    if (isProgrammaticScroll) {
      agentMessageScrollState.wasPinnedToBottomByTabId.set(tabId, true);
    } else {
      agentMessageScrollState.wasPinnedToBottomByTabId.set(tabId, isScrolledNearBottom(element));
    }

    if (!isProgrammaticScroll && displayMessages.length > 0) {
      setIsScrollToBottomVisible(!isScrolledNearBottom(element));
    }
  }, [displayMessages.length, renderedItemCount, tabId]);
  const scrollToLatestMessage = useCallback(() => {
    const element = scrollRef.current;
    if (!element || renderedItemCount === 0) {
      return;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (element.scrollTop >= maxScrollTop - 1) {
      agentMessageScrollState.wasPinnedToBottomByTabId.set(tabId, true);
      return;
    }

    programmaticScrollRef.current = true;
    agentMessageScrollState.wasPinnedToBottomByTabId.set(tabId, true);
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
      agentMessageScrollState.savedScrollTopByTabId.set(tabId, element.scrollTop);
      agentMessageScrollState.savedRenderedItemCountByTabId.set(tabId, renderedItemCount);
      agentMessageScrollState.wasPinnedToBottomByTabId.set(tabId, isScrolledNearBottom(element));
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
    if (!isInitialTranscriptRender && !(agentMessageScrollState.wasPinnedToBottomByTabId.get(tabId) ?? true)) {
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

    if (!(agentMessageScrollState.wasPinnedToBottomByTabId.get(tabId) ?? true)) {
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
    if (
      !isActive ||
      virtualMessageTotalSize === 0 ||
      !(agentMessageScrollState.wasPinnedToBottomByTabId.get(tabId) ?? true)
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToLatestMessage();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isActive, scrollToLatestMessage, tabId, virtualMessageTotalSize]);

  if (displayMessages.length === 0 && queuedCount === 0) {
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
          width: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          px: 2,
          py: 1,
        }}
      >
        <AgentMessageListContent
          agentChatWidth={agentChatWidth}
          agentToolCallStates={agentToolCallStates}
          bottomSentinelRef={bottomSentinelRef}
          dshDelegationDiagnostics={dshDelegationDiagnostics}
          dshDelegationStates={dshDelegationStates}
          hasWorkingTurn={hasWorkingTurn}
          isWorking={isWorking}
          measureElement={virtualizer.measureElement}
          onOpenCompletedSubagent={onOpenCompletedSubagent}
          queuedMessages={queuedMessages}
          rows={rows}
          runtime={runtime}
          virtualMessageTotalSize={virtualMessageTotalSize}
          virtualMessages={virtualMessages}
          workingLabel={workingLabel}
          workspacePath={workspacePath}
        />
      </Box>
      {isScrollToBottomVisible && displayMessages.length > 0 ? (
        <AgentMessageScrollToBottomButton
          ariaLabel={t("agentChat.scrollToBottom")}
          onClick={handleScrollToBottomClick}
        />
      ) : null}
    </Box>
  );
}

const MemoizedAgentMessageList = memo(AgentMessageListComponent);
MemoizedAgentMessageList.displayName = "AgentMessageList";

export const AgentMessageList = MemoizedAgentMessageList;
