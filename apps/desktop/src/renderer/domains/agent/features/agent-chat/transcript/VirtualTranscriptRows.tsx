import { Box } from "@mui/material";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { AgentToolCallLifecycleState } from "../../../chat/agentChatSubagents";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentTurn } from "./AgentTurn";
import { SubagentCompletionRow } from "./SubagentCompletionRow";
import { UserMessageRow } from "./UserMessageRow";
import type { TranscriptRow } from "./turnModel";

type VirtualTranscriptRowsProps = {
  rows: TranscriptRow[];
  virtualMessages: VirtualItem[];
  totalSize: number;
  measureElement: (element: HTMLDivElement | null) => void;
  workspacePath?: string;
  agentToolCallStates: ReadonlyMap<string, AgentToolCallLifecycleState>;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/** Places each transcript kind in the same measured virtual row without changing its payload. */
export function VirtualTranscriptRows({
  rows,
  virtualMessages,
  totalSize,
  measureElement,
  workspacePath,
  agentToolCallStates,
  onOpenCompletedSubagent,
}: VirtualTranscriptRowsProps) {
  return (
    <Box sx={{ height: totalSize, position: "relative", width: "100%" }}>
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
            ) : row.kind === "completion" ? (
              <SubagentCompletionRow completion={row.completion} onOpenCompletedSubagent={onOpenCompletedSubagent} />
            ) : (
              <AgentTurn
                turn={row.turn}
                workspacePath={workspacePath}
                agentToolCallStates={agentToolCallStates}
                onOpenCompletedSubagent={onOpenCompletedSubagent}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
