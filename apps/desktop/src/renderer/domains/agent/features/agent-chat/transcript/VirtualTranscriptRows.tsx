import { Box } from "@mui/material";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { DisplayRow } from "../../../chat/transcript/presentation.types";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentTurn } from "./AgentTurn";
import { SubagentCompletionRow } from "./SubagentCompletionRow";
import { ToolResultMessageContent } from "./ToolResultMessageContent";
import { UserMessageRow } from "./UserMessageRow";

type VirtualTranscriptRowsProps = {
  rows: readonly DisplayRow[];
  virtualMessages: VirtualItem[];
  totalSize: number;
  measureElement: (element: HTMLDivElement | null) => void;
  workspacePath?: string;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/** Places each transcript kind in the same measured virtual row without changing its payload. */
export function VirtualTranscriptRows({
  rows,
  virtualMessages,
  totalSize,
  measureElement,
  workspacePath,
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
              <UserMessageRow row={row} />
            ) : row.kind === "completion" ? (
              <SubagentCompletionRow completion={row.completion} onOpenCompletedSubagent={onOpenCompletedSubagent} />
            ) : row.kind === "unmatched" ? (
              <ToolResultMessageContent toolName={row.toolName} text={row.text} isError={row.isError} />
            ) : row.kind === "unresolved" ? (
              <ToolResultMessageContent
                toolName={row.card.toolCall.name}
                text={row.card.result?.text ?? ""}
                isError={row.card.isError}
                state={row.card.presentationState}
              />
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
  );
}
