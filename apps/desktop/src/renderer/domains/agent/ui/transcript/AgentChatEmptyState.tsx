import { Box, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import yishanLogo from "../../../../../assets/images/yishan-transparent.png";

const EMPTY_MIN_HEIGHT = 320;

type AgentChatEmptyStateProps = {
  helpLines?: string[];
  helpPrefix?: string;
};

/**
 * Centered empty-transcript panel: a faint ghost logo plus one randomly
 * chosen help tip. The parent only mounts this while the transcript is empty,
 * so each empty-state entry picks a fresh tip.
 */
export function AgentChatEmptyState({ helpLines, helpPrefix }: AgentChatEmptyStateProps) {
  const [helpLine, setHelpLine] = useState<string | null>(null);

  useEffect(() => {
    const lines = helpLines ?? [];
    if (lines.length > 0) {
      setHelpLine(lines[Math.floor(Math.random() * lines.length)] ?? null);
    } else {
      setHelpLine(null);
    }
  }, [helpLines]);

  return (
    <Box
      data-testid="agent-chat-empty-state"
      sx={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        px: 2,
        py: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: EMPTY_MIN_HEIGHT,
      }}
    >
      <Box
        component="img"
        src={yishanLogo}
        alt=""
        aria-hidden
        sx={{
          width: 192,
          height: 149,
          opacity: 0.1,
          filter: "grayscale(1)",
        }}
      />
      {helpLine ? (
        <Typography
          data-testid="agent-chat-empty-help"
          variant="caption"
          sx={{
            mt: 3,
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          {helpPrefix ? (
            <>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {helpPrefix}
              </Box>{" "}
            </>
          ) : null}
          {helpLine}
        </Typography>
      ) : null}
    </Box>
  );
}
