import { Box, Button, Typography } from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LuPanelRightOpen } from "react-icons/lu";
import type { SubagentCompletion } from "../../../chat/agentChatCompletion";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";

type SubagentCompletionRowProps = {
  completion: SubagentCompletion;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/** A quiet terminal notice linking to the existing child record, never to prose-derived paths. */
export function SubagentCompletionRow({ completion, onOpenCompletedSubagent }: SubagentCompletionRowProps) {
  const { t } = useTranslation();
  const { agentId, agentName, status, sessionId } = completion;
  const canOpen = Boolean(sessionId && onOpenCompletedSubagent);
  const handleOpen = useCallback(async () => {
    if (!sessionId || !onOpenCompletedSubagent) return;
    try {
      await onOpenCompletedSubagent({ agentId, childSessionId: sessionId, title: agentName });
    } catch (error) {
      console.error("[SubagentCompletionRow] Failed to open child record", getErrorMessage(error));
    }
  }, [agentId, agentName, onOpenCompletedSubagent, sessionId]);

  return (
    <Box
      data-testid="subagent-completion-row"
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: 1,
        rowGap: 0.5,
        px: 1.5,
        py: 0.75,
        color: "text.secondary",
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
        {agentName}
      </Typography>
      <Typography variant="caption">{t(`agentChat.subagentCompletion.${status}`)}</Typography>
      {canOpen ? (
        <Button
          size="small"
          color="inherit"
          aria-label={t("agentChat.subagentCompletion.openLabel", { agentName })}
          onClick={handleOpen}
          sx={{ minWidth: 0, textTransform: "none", gap: 0.5, fontSize: "inherit" }}
        >
          <LuPanelRightOpen size={14} aria-hidden />
          {t("agentChat.subagentCompletion.open")}
        </Button>
      ) : (
        <Typography variant="caption">{t("agentChat.subagentCompletion.unavailable")}</Typography>
      )}
    </Box>
  );
}
