import { Box, IconButton, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuArrowUp, LuShrink } from "react-icons/lu";
import type { AgentModel } from "../../../chat/agentChatTypes";
import { AgentModelSelector } from "../../select-model/AgentModelSelector";
import { AgentChatUsageSummaryLabel } from "../session/AgentChatUsageSummaryLabel";
import { AgentChatVoiceButton } from "./AgentChatVoiceButton";

export type AgentChatComposerFooterProps = {
  tabId: string;
  availableModels: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string;
  onModelChange: (model: AgentModel) => void;
  onThinkingLevelSelect: (level: string) => void;
  onAddProvider: () => void;
  sessionState: string;
  canManuallyCompact: boolean;
  isManualCompactPending: boolean;
  isSessionBusy: boolean;
  draft: string;
  attachmentCount: number;
  onCompact: () => void;
  onAbort: () => void;
  onSubmitButtonClick: () => void;
  onVoiceText: (text: string) => void;
};

/** The composer action bar: model selector, usage, compact, voice, stop/submit. */
export function AgentChatComposerFooter({
  tabId,
  availableModels,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelSelect,
  onAddProvider,
  sessionState,
  canManuallyCompact,
  isManualCompactPending,
  isSessionBusy,
  draft,
  attachmentCount,
  onCompact,
  onAbort,
  onSubmitButtonClick,
  onVoiceText,
}: AgentChatComposerFooterProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 4, px: 1, minHeight: 18 }}>
      {availableModels.length > 0 && (
        <AgentModelSelector
          models={availableModels}
          currentModel={currentModel}
          thinkingLevel={thinkingLevel}
          onModelChange={onModelChange}
          onThinkingLevelSelect={onThinkingLevelSelect}
          onAddProvider={onAddProvider}
        />
      )}
      <AgentChatUsageSummaryLabel tabId={tabId} />
      <Tooltip title={t("agentChat.composer.compact")} placement="top">
        <span>
          <IconButton
            aria-label={t("agentChat.composer.compact")}
            onClick={() => {
              void onCompact();
            }}
            disabled={sessionState !== "idle" || !canManuallyCompact || isManualCompactPending}
            size="small"
          >
            <LuShrink size={15} />
          </IconButton>
        </span>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, overflow: "visible" }}>
        <AgentChatVoiceButton
          onText={onVoiceText}
          disabled={sessionState === "starting"}
          disabledMessage={t("agentChat.voice.unavailableStarting")}
        />
        {isSessionBusy ? (
          <Tooltip title={t("agentChat.composer.stop")} placement="top">
            <span>
              <IconButton
                onClick={onAbort}
                aria-label={t("agentChat.composer.stop")}
                sx={{
                  width: 34,
                  height: 34,
                  p: 0,
                  border: "1px solid",
                  borderColor: (theme) => (theme.palette.mode === "dark" ? "divider" : theme.palette.error.main),
                  bgcolor: (theme) => (theme.palette.mode === "dark" ? "background.paper" : theme.palette.error.main),
                  color: (theme) =>
                    theme.palette.mode === "dark" ? "text.secondary" : theme.palette.error.contrastText,
                  borderRadius: 999,
                  boxShadow: 1,
                  transition: "background-color 120ms ease, border-color 120ms ease",
                  "&:hover": {
                    bgcolor: (theme) => (theme.palette.mode === "dark" ? "action.hover" : theme.palette.error.dark),
                  },
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: 0.5,
                    bgcolor: "currentColor",
                  }}
                />
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title={t("agentChat.composer.submit")} placement="top">
            <span>
              <IconButton
                onClick={() => {
                  void onSubmitButtonClick();
                }}
                disabled={
                  sessionState === "starting" ||
                  isManualCompactPending ||
                  (draft.trim().length === 0 && attachmentCount === 0)
                }
                aria-label={t("agentChat.composer.submit")}
                sx={{
                  width: 34,
                  height: 34,
                  p: 0,
                  border: "1px solid",
                  borderColor: "primary.main",
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  borderRadius: 999,
                  boxShadow: 1,
                  transition: "background-color 120ms ease, border-color 120ms ease",
                  "&:hover": {
                    bgcolor: "primary.dark",
                  },
                  "&.Mui-disabled": {
                    borderColor: "action.disabledBackground",
                    bgcolor: "action.disabledBackground",
                    color: "action.disabled",
                    boxShadow: 0,
                  },
                }}
              >
                <LuArrowUp size={16} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
