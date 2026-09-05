import { Box, CircularProgress, Typography } from "@mui/material";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import type {
  DshDelegationDiagnostic,
  DshDelegationState,
} from "../../../../../domains/agent/chat/agentChatDshDelegation";
import type { AgentToolCallLifecycleState } from "../../../../../domains/agent/chat/agentChatSubagents";
import type { AgentQueueState } from "../../../../../domains/agent/chat/agentChatTypes";
import type { AgentRuntime } from "../../../daemon/daemonAgentTypes";
import { AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX } from "../chat/AgentChatContentLayout";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentTurn } from "./AgentTurn";
import { QueuedMessageList } from "./QueuedMessageList";
import { UserMessageRow } from "./UserMessageRow";
import type { TranscriptRow } from "./turnModel";

type AgentMessageListContentProps = {
  agentChatWidth: "fixed" | "full";
  bottomSentinelRef: RefObject<HTMLDivElement | null>;
  dshDelegationDiagnostics: ReadonlyMap<string, DshDelegationDiagnostic>;
  dshDelegationStates: ReadonlyMap<string, DshDelegationState>;
  hasWorkingTurn: boolean;
  isWorking: boolean;
  measureElement: (element: Element | null) => void;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
  queuedMessages?: AgentQueueState;
  rows: TranscriptRow[];
  runtime?: AgentRuntime;
  virtualMessageTotalSize: number;
  virtualMessages: VirtualItem[];
  workingLabel?: string;
  workspacePath?: string;
  agentToolCallStates: ReadonlyMap<string, AgentToolCallLifecycleState>;
};

/** Renders virtualized transcript rows and the supplemental queue/status rows. */
export function AgentMessageListContent({
  agentChatWidth,
  agentToolCallStates,
  bottomSentinelRef,
  dshDelegationDiagnostics,
  dshDelegationStates,
  hasWorkingTurn,
  isWorking,
  measureElement,
  onOpenCompletedSubagent,
  queuedMessages,
  rows,
  runtime,
  virtualMessageTotalSize,
  virtualMessages,
  workingLabel,
  workspacePath,
}: AgentMessageListContentProps) {
  return (
    <Box
      data-testid="agent-message-list-content"
      sx={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        gap: 1,
        ...(agentChatWidth === "fixed"
          ? { maxWidth: AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX, mx: "auto", width: "100%" }
          : {}),
      }}
    >
      <Box sx={{ height: virtualMessageTotalSize, position: "relative", width: "100%" }}>
        {virtualMessages.map((virtualMessage) => {
          const row = rows[virtualMessage.index];
          if (!row) return null;
          return (
            <Box
              key={virtualMessage.key}
              data-index={virtualMessage.index}
              ref={measureElement}
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
                  agentToolCallStates={agentToolCallStates}
                  dshDelegationStates={dshDelegationStates}
                  dshDelegationDiagnostics={dshDelegationDiagnostics}
                  runtime={runtime}
                  onOpenCompletedSubagent={onOpenCompletedSubagent}
                />
              )}
            </Box>
          );
        })}
      </Box>
      {isWorking && !hasWorkingTurn ? (
        <Box
          data-testid="agent-turn-working-indicator"
          sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, color: "text.secondary" }}
        >
          <CircularProgress size={14} thickness={5} />
          <Typography variant="caption" sx={{ color: "inherit" }}>
            {workingLabel ?? "working…"}
          </Typography>
        </Box>
      ) : null}
      {queuedMessages ? (
        <QueuedMessageList steering={queuedMessages.steering} followUp={queuedMessages.followUp} />
      ) : null}
      <Box ref={bottomSentinelRef} aria-hidden sx={{ height: 1, flexShrink: 0 }} />
    </Box>
  );
}
