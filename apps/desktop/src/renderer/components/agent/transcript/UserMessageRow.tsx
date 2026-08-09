import { Box, IconButton, Paper, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import type { AgentMessage } from "../../../store/agentChatTypes";
import { UserMessageContent } from "./UserMessageContent";
import { extractMessageText } from "./helpers";

/** Collapsed height cap for long user messages; taller content gets a gradient + expand overlay. */
const MAX_COLLAPSED_HEIGHT_PX = 160;
const OVERFLOW_TOLERANCE_PX = 1;
const FADE_HEIGHT_PX = 56;

type UserMessageRowProps = {
  message: AgentMessage;
};

/**
 * Standalone user message card, unchanged from the pre-turn transcript:
 * highlighted background with the left accent border, plus the human-readable
 * timestamp when one is recorded. Never part of a collapsible turn. Long
 * messages are clamped to a max height with a bottom gradient and an overlay
 * expand button; clicking it reveals the full text.
 */
export function UserMessageRow({ message }: UserMessageRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const messageText = extractMessageText(message.content);
  const humanTimestamp = typeof message.timestamp === "number" ? formatHumanMessageTime(message.timestamp) : null;

  useEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }
    const measure = () => {
      // Compare against the collapsed cap (not the live height) so the toggle
      // stays available after expanding: the message is still "overflowing"
      // whenever its natural height exceeds the cap.
      setIsOverflowing(element.scrollHeight > MAX_COLLAPSED_HEIGHT_PX + OVERFLOW_TOLERANCE_PX);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [messageText]);

  return (
    <Paper
      elevation={0}
      data-testid="user-message-row"
      sx={{
        p: 1.5,
        width: "100%",
        bgcolor: "action.selected",
        borderLeft: 3,
        borderColor: "info.main",
        borderRadius: 1,
      }}
    >
      <Box sx={{ position: "relative" }}>
        <Box
          ref={contentRef}
          data-testid="user-message-content"
          sx={{
            maxHeight: expanded ? undefined : MAX_COLLAPSED_HEIGHT_PX,
            overflow: "hidden",
          }}
        >
          <UserMessageContent messageText={messageText} />
        </Box>
        {!expanded && isOverflowing ? (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: FADE_HEIGHT_PX,
              pointerEvents: "none",
              background: (theme) =>
                `linear-gradient(to top, ${theme.palette.action.selected}, transparent)`,
            }}
          />
        ) : null}
      </Box>
      {isOverflowing || humanTimestamp ? (
        <Box
          sx={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            mt: 0.5,
            minHeight: 24,
          }}
        >
          {isOverflowing ? (
            <IconButton
              size="small"
              aria-label={
                expanded ? t("agentChat.userMessage.showLess") : t("agentChat.userMessage.showMore")
              }
              onClick={() => setExpanded(!expanded)}
              sx={{
                color: "text.secondary",
                "&:hover": {
                  bgcolor: "transparent",
                  color: "text.primary",
                },
              }}
            >
              {expanded ? <LuChevronUp size={16} /> : <LuChevronDown size={16} />}
            </IconButton>
          ) : null}
          {humanTimestamp ? (
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              {humanTimestamp}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}

function formatHumanMessageTime(timestamp: number): string | null {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
