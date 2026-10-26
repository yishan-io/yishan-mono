import { Box, Typography } from "@mui/material";
import type { ToolExecutionState } from "../../../chat/transcript/toolCalls.types";

type ToolResultMessageContentProps = {
  toolName: string;
  text: string;
  isError: boolean;
  state?: ToolExecutionState;
};

/** Renders a standalone tool result message when it is not merged into a tool-call card. */
export function ToolResultMessageContent({ toolName, text, isError, state }: ToolResultMessageContentProps) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          fontWeight: 600,
        }}
      >
        {toolName}
        {isError ? " (error)" : ""}
        {state ? ` (${state})` : ""}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          mt: 0.5,
          color: isError ? "error.main" : undefined,
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}
