import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowUp } from "react-icons/lu";
import { abortAgent, sendAgentPrompt, setAgentModel, setAgentThinkingLevel } from "../../commands/agentChatCommands";
import { renameTab } from "../../commands/tabCommands";
import { AgentChatVoiceButton } from "../../components/AgentChatVoiceButton";
import { RichComposer } from "../../components/RichComposer";
import { AgentChatSubagentRow } from "../../components/agent/session/AgentChatSubagentRow";
import { AgentChatUsageSummaryLabel } from "../../components/agent/session/AgentChatUsageSummaryLabel";
import { AgentModelSelector } from "../../components/agent/session/AgentModelSelector";
import { AGENT_CHAT_COMPOSER_FOCUS_EVENT } from "../../events/agentChatComposerFocus";
import { formatAgentSessionTitle } from "../../helpers/agentSkillTextHelpers";
import { getSupportedKeyBindings } from "../../shortcuts/keybindings";
import { agentChatStore } from "../../store/agentChatStore";
import type { AgentModel } from "../../store/agentChatTypes";
import { keybindingSettingsStore } from "../../store/settings/keybindingSettingsStore";
import { tabStore } from "../../store/tabStore";
import { transformAgentChatPromptForSkills } from "./agentChatSkillPromptTransform";
import { useAgentChatSlashCommands } from "./useAgentChatSlashCommands";
import { useAgentChatSubagentActions } from "./useAgentChatSubagentActions";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
const EMPTY_MODELS: AgentModel[] = [];

type AgentChatComposerPaneProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
};

function AgentChatComposerPaneComponent({ tabId, workspaceId, cwd, paneId }: AgentChatComposerPaneProps) {
  const { t } = useTranslation();
  const slashCommands = useAgentChatSlashCommands();
  const agentChatTab = tabStore((state) =>
    state.tabs.find((tab): tab is Extract<(typeof state.tabs)[number], { kind: "agent-chat" }> => {
      return tab.id === tabId && tab.kind === "agent-chat";
    }),
  );
  const sessionId = agentChatStore((state) => state.sessionsByTabId[tabId]?.sessionId ?? null);
  const { runningSubagents, subagentProgressTargets, handleOpenSubagent, handleCancelSubagent } =
    useAgentChatSubagentActions({ tabId, workspaceId, cwd, paneId, sessionId });
  const sessionState = agentChatStore((state) => state.sessionsByTabId[tabId]?.state ?? "starting");
  const availableModels = agentChatStore((state) => state.sessionsByTabId[tabId]?.availableModels ?? EMPTY_MODELS);
  const currentModel = agentChatStore((state) => state.sessionsByTabId[tabId]?.currentModel ?? null);
  const thinkingLevel = agentChatStore((state) => state.sessionsByTabId[tabId]?.thinkingLevel ?? "medium");
  const shortcutOverrides = keybindingSettingsStore((state) => state.overridesById);
  const focusShortcutHint = useMemo(() => {
    const focusShortcutBinding = getSupportedKeyBindings(shortcutOverrides).find(
      (binding) => binding.id === "focus-agent-chat-composer",
    );
    const shortcutKeys =
      window.desktop?.platform === "darwin" ? focusShortcutBinding?.macKeys : focusShortcutBinding?.windowsKeys;
    const shortcutLabel = shortcutKeys?.join(" + ");
    return shortcutLabel ? t("agentChat.composer.focusShortcut", { shortcut: shortcutLabel }) : undefined;
  }, [shortcutOverrides, t]);
  const messageCount = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages.length ?? 0);
  const hasStreamingMessage = agentChatStore((state) => Boolean(state.sessionsByTabId[tabId]?.streamingMessage));
  const [draft, setDraft] = useState("");
  const composerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleFocusRequest = (event: Event) => {
      const request = event as CustomEvent<{ tabId: string }>;
      if (request.detail.tabId !== tabId) {
        return;
      }

      composerContainerRef.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus();
    };

    window.addEventListener(AGENT_CHAT_COMPOSER_FOCUS_EVENT, handleFocusRequest);
    return () => {
      window.removeEventListener(AGENT_CHAT_COMPOSER_FOCUS_EVENT, handleFocusRequest);
    };
  }, [tabId]);

  const handleSubmit = useCallback(
    async (value: string) => {
      const prompt = value.trim();
      if (!sessionId || !prompt) return;

      if (messageCount === 0 && !hasStreamingMessage && !agentChatTab?.data.userRenamed) {
        renameTab(tabId, formatAgentSessionTitle(prompt));
      }

      const nextMessage = await transformAgentChatPromptForSkills(prompt, slashCommands);
      await sendAgentPrompt({ tabId, sessionId, message: nextMessage });
    },
    [agentChatTab?.data.userRenamed, hasStreamingMessage, messageCount, sessionId, slashCommands, tabId],
  );

  const handleAbort = useCallback(async () => {
    if (!sessionId) return;
    await abortAgent({ tabId, sessionId });
  }, [sessionId, tabId]);

  const handleSubmitButtonClick = useCallback(async () => {
    const nextDraft = draft.trim();
    if (!nextDraft) return;
    await handleSubmit(nextDraft);
    setDraft("");
  }, [draft, handleSubmit]);

  const handleVoiceText = useCallback((text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }

    setDraft((currentDraft) => {
      const separator =
        currentDraft.length === 0 || currentDraft.endsWith(" ") || currentDraft.endsWith("\n") ? "" : " ";
      return `${currentDraft}${separator}${normalizedText}`;
    });
  }, []);

  const handleModelChange = useCallback(
    async (model: AgentModel) => {
      if (!sessionId) return;
      await setAgentModel({ tabId, sessionId, provider: model.provider ?? "", modelId: model.id });
    },
    [sessionId, tabId],
  );

  const handleThinkingCycle = useCallback(async () => {
    if (!sessionId) return;
    const currentIdx = THINKING_LEVELS.indexOf(thinkingLevel);
    const nextLevel = THINKING_LEVELS[(currentIdx + 1) % THINKING_LEVELS.length] ?? THINKING_LEVELS[0] ?? "medium";
    await setAgentThinkingLevel({ tabId, sessionId, level: nextLevel });
  }, [sessionId, tabId, thinkingLevel]);

  return (
    <Box
      ref={composerContainerRef}
      sx={{
        borderTop: 1,
        borderColor: "divider",
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      {runningSubagents.length > 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
            px: 0.5,
            py: 0.25,
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ px: 0.5, fontWeight: 700 }}>
            Running sub-agents
          </Typography>
          {runningSubagents.map((subagent) => {
            const matchingProgressTargets = subagentProgressTargets.filter(
              (target) => target.agentName === subagent.agentName,
            );
            const canCancel = Boolean(
              subagent.agentId || subagent.childSessionId || matchingProgressTargets.length === 1,
            );

            return (
              <AgentChatSubagentRow
                key={subagent.rowId}
                subagent={subagent}
                isRunning
                canCancel={canCancel}
                onOpen={handleOpenSubagent}
                onCancel={handleCancelSubagent}
              />
            );
          })}
        </Box>
      ) : null}
      <RichComposer
        placeholder="Type a message…"
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        disabled={sessionState === "starting"}
        slashCommands={slashCommands}
        focusShortcutHint={focusShortcutHint}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 4, px: 1, minHeight: 18 }}>
        {availableModels.length > 0 && (
          <AgentModelSelector
            models={availableModels}
            currentModel={currentModel}
            thinkingLevel={thinkingLevel}
            onModelChange={handleModelChange}
            onThinkingLevelCycle={handleThinkingCycle}
          />
        )}
        <AgentChatUsageSummaryLabel tabId={tabId} />
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, overflow: "visible" }}>
          <AgentChatVoiceButton
            onText={handleVoiceText}
            disabled={sessionState === "starting"}
            disabledMessage={t("agentChat.voice.unavailableStarting")}
          />
          {sessionState === "running" ? (
            <Tooltip title={t("agentChat.composer.stop")} placement="top">
              <span>
                <IconButton
                  size="small"
                  onClick={handleAbort}
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
                  size="small"
                  onClick={() => {
                    void handleSubmitButtonClick();
                  }}
                  disabled={sessionState === "starting" || draft.trim().length === 0}
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
    </Box>
  );
}

/** Renders the interactive agent chat composer and controls. */
export const AgentChatComposerPane = memo(AgentChatComposerPaneComponent);
AgentChatComposerPane.displayName = "AgentChatComposerPane";
