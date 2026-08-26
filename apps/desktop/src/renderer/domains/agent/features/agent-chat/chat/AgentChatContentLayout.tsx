import { Box } from "@mui/material";
import { displaySettingsStore } from "@renderer/domains/settings";
import type { ReactNode } from "react";

export const AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX = 960;

const shellSx = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
  width: "100%",
} as const;

const fullWidthContentSx = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  width: "100%",
} as const;

type AgentChatContentLayoutProps = {
  children: ReactNode;
};

/** Preserves pane geometry while applying the user's agent-chat content width preference. */
export function AgentChatContentLayout({ children }: AgentChatContentLayoutProps) {
  const agentChatWidth = displaySettingsStore((state) => state.agentChatWidth);

  return (
    <Box data-testid="agent-chat-layout-shell" sx={shellSx}>
      <Box data-testid="agent-chat-content-column" data-width-mode={agentChatWidth} sx={fullWidthContentSx}>
        {children}
      </Box>
    </Box>
  );
}
