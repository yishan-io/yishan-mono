import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { searchFiles } from "@renderer/domains/files";
import { useKeybindingOverrides } from "@renderer/domains/settings";
import { tabStore } from "@renderer/domains/workbench";
import { renameTab } from "@renderer/domains/workbench";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowUp, LuShrink } from "react-icons/lu";
import {
  AGENT_CHAT_COMPOSER_FOCUS_EVENT,
  consumeAgentChatComposerFocus,
  getAgentChatComposerFocusRequest,
} from "../../../../../events/agentChatComposerFocus";
import { getErrorMessage } from "../../../../../helpers/errorHelpers";
import { generateId } from "../../../../../helpers/generateId";
import { getSupportedKeyBindings } from "../../../../../shortcuts/keybindings";
import { abortAgent, compactAgent, sendAgentPrompt } from "../../../commands/agentChatCommands";
import { setAgentModel, setAgentThinkingLevel } from "../../../events/agentChatPiEventShared";
import { useAgentChatSessionMeta } from "../../../hooks/useAgentChatReadHooks";
import { type AgentMessage, type AgentModel, isAgentSessionBusy } from "../../../model/agentChatTypes";
import { formatAgentSessionTitle } from "../../../model/agentSkillTextHelpers";
import { setTurnError } from "../../../state/chatActions";
import { ProviderCredentialDialog } from "../../../ui/credentials/ProviderCredentialDialog";
import { AgentChatSubagentRow } from "../session/AgentChatSubagentRow";
import { AgentChatUsageSummaryLabel } from "../session/AgentChatUsageSummaryLabel";
import { AgentModelSelector } from "../session/AgentModelSelector";
import { AgentChatVoiceButton } from "./AgentChatVoiceButton";
import { transformAgentChatPromptForSkills } from "./agentChatSkillPromptTransform";
import { type ComposerAttachment, ComposerAttachmentBlock } from "./composer/ComposerAttachmentBlock";
import { type DroppedFileEntry, RichComposer } from "./composer/RichComposer";
import { useAgentChatProviderAdd } from "./useAgentChatProviderAdd";
import { useAgentChatSlashCommands } from "./useAgentChatSlashCommands";
import { useAgentChatSubagentActions } from "./useAgentChatSubagentActions";

const MAX_FILE_MENTION_RESULTS = 50;

type AgentChatComposerPaneProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  isActive: boolean;
  isReadyForAutoFocus: boolean;
};

function AgentChatComposerPaneComponent({
  tabId,
  workspaceId,
  cwd,
  paneId,
  isActive,
  isReadyForAutoFocus,
}: AgentChatComposerPaneProps) {
  const { t } = useTranslation();
  const slashCommands = useAgentChatSlashCommands();
  const foundTab = tabStore((state) => state.tabs.find((tab) => tab.id === tabId));
  const agentChatTab = foundTab?.kind === "agent-chat" ? foundTab : undefined;
  const {
    sessionId,
    sessionState,
    subagentSessionEndedAtMs,
    compactionReason,
    availableModels,
    currentModel,
    thinkingLevel,
    messageCount,
    hasStreamingMessage,
    contextPercent,
  } = useAgentChatSessionMeta(tabId);
  const { runningSubagents, subagentProgressTargets, subagentCancelStates, handleOpenSubagent, handleCancelSubagent } =
    useAgentChatSubagentActions({ tabId, workspaceId, cwd, paneId, sessionId });
  const shortcutOverrides = useKeybindingOverrides();
  const focusShortcutHint = useMemo(() => {
    const focusShortcutBinding = getSupportedKeyBindings(shortcutOverrides).find(
      (binding) => binding.id === "focus-agent-chat-composer",
    );
    const shortcutKeys =
      window.desktop?.platform === "darwin" ? focusShortcutBinding?.macKeys : focusShortcutBinding?.windowsKeys;
    const shortcutLabel = shortcutKeys?.join(" + ");
    return shortcutLabel ? t("agentChat.composer.focusShortcut", { shortcut: shortcutLabel }) : undefined;
  }, [shortcutOverrides, t]);
  const isSessionBusy = isAgentSessionBusy(sessionState);
  const canManuallyCompact = contextPercent >= 50;
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isManualCompactPending, setIsManualCompactPending] = useState(false);
  const composerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (sessionState !== "idle") {
      setIsManualCompactPending(false);
    }
  }, [sessionState]);

  const focusComposer = useCallback(() => {
    composerContainerRef.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus();
  }, []);

  useEffect(() => {
    const handleFocusRequest = (event: Event) => {
      const request = event as CustomEvent<{ tabId: string }>;
      if (request.detail.tabId !== tabId || sessionState === "starting" || !isActive) {
        return;
      }

      const requestKind = getAgentChatComposerFocusRequest(tabId);
      if (requestKind === "auto" && !isReadyForAutoFocus) {
        return;
      }

      focusComposer();
      if (requestKind) {
        consumeAgentChatComposerFocus(tabId);
      }
    };

    window.addEventListener(AGENT_CHAT_COMPOSER_FOCUS_EVENT, handleFocusRequest);
    return () => {
      window.removeEventListener(AGENT_CHAT_COMPOSER_FOCUS_EVENT, handleFocusRequest);
    };
  }, [focusComposer, isActive, isReadyForAutoFocus, sessionState, tabId]);

  useEffect(() => {
    const requestKind = getAgentChatComposerFocusRequest(tabId);
    if (!requestKind || sessionState === "starting" || !isActive || (requestKind === "auto" && !isReadyForAutoFocus)) {
      return;
    }

    focusComposer();
    consumeAgentChatComposerFocus(tabId);
  }, [focusComposer, isActive, isReadyForAutoFocus, sessionState, tabId]);

  const handleSubmit = useCallback(
    async (value: string): Promise<boolean> => {
      const prompt = value.trim();
      if (!sessionId || (!prompt && attachments.length === 0)) return false;

      if (prompt && messageCount === 0 && !hasStreamingMessage && !agentChatTab?.data.userRenamed) {
        renameTab(tabId, formatAgentSessionTitle(prompt));
      }

      const nextMessage = await transformAgentChatPromptForSkills(prompt, slashCommands);

      const fileParts = attachments.filter((a) => a.kind === "file").map((a) => a.path);
      const pasteParts = attachments.filter((a) => a.kind === "paste").map((a) => a.content);
      const parts: string[] = [];
      if (fileParts.length > 0) parts.push(`Files:\n${fileParts.join("\n")}`);
      if (pasteParts.length > 0) parts.push(`Pasted content:\n${pasteParts.join("\n\n---\n\n")}`);
      const finalMessage =
        parts.length > 0 ? (nextMessage ? `${nextMessage}\n\n${parts.join("\n\n")}` : parts.join("\n\n")) : nextMessage;

      try {
        await sendAgentPrompt({ tabId, sessionId, message: finalMessage });
      } catch (error) {
        setTurnError(tabId, getErrorMessage(error));
        return false;
      }
      setAttachments([]);
      return true;
    },
    [agentChatTab?.data.userRenamed, attachments, hasStreamingMessage, messageCount, sessionId, slashCommands, tabId],
  );

  const handleAddFile = useCallback((path: string, isDirectory = false) => {
    setAttachments((prev) => {
      if (prev.some((attachment) => attachment.kind === "file" && attachment.path === path)) {
        return prev;
      }
      return [
        ...prev,
        {
          kind: "file" as const,
          id: generateId(),
          path,
          name: path.split(/[\\/]/).pop() ?? path,
          isDirectory,
        },
      ];
    });
  }, []);

  const handleFilesDrop = useCallback(
    (entries: DroppedFileEntry[]) => {
      for (const entry of entries) {
        handleAddFile(entry.path, entry.isDirectory);
      }
    },
    [handleAddFile],
  );

  const handleMentionFileSearch = useCallback(
    (query: string) => searchFiles({ workspaceId, query, limit: MAX_FILE_MENTION_RESULTS, includeDirectories: true }),
    [workspaceId],
  );

  const handlePasteBlock = useCallback((text: string) => {
    const lineCount = text.split("\n").filter((l) => l.trim()).length;
    setAttachments((prev) => [...prev, { kind: "paste" as const, id: generateId(), content: text, lineCount }]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAbort = useCallback(async () => {
    if (!sessionId) return;
    try {
      await abortAgent({ tabId, sessionId });
    } catch (error) {
      setTurnError(tabId, getErrorMessage(error));
    }
  }, [sessionId, tabId]);

  const handleCompact = useCallback(async () => {
    if (!sessionId || isManualCompactPending) return;

    setIsManualCompactPending(true);
    try {
      await compactAgent({ sessionId });
    } catch (error) {
      setTurnError(tabId, getErrorMessage(error));
      setIsManualCompactPending(false);
    }
  }, [isManualCompactPending, sessionId, tabId]);

  const handleSubmitButtonClick = useCallback(async () => {
    const nextDraft = draft.trim();
    if (!nextDraft && attachments.length === 0) return;
    const sent = await handleSubmit(nextDraft);
    if (sent) {
      setDraft("");
    }
  }, [attachments.length, draft, handleSubmit]);

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
      try {
        await setAgentModel({ tabId, sessionId, provider: model.provider ?? "", modelId: model.id });
      } catch (error) {
        setTurnError(tabId, getErrorMessage(error));
      }
    },
    [sessionId, tabId],
  );

  const { openAddProviderDialog, providerCredentialDialogProps } = useAgentChatProviderAdd({
    tabId,
    workspaceId,
    cwd,
    paneId,
    sessionId,
    sessionState,
  });

  const handleThinkingSelect = useCallback(
    async (level: string) => {
      if (!sessionId) return;
      try {
        await setAgentThinkingLevel({ tabId, sessionId, level });
      } catch (error) {
        setTurnError(tabId, getErrorMessage(error));
      }
    },
    [sessionId, tabId],
  );

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
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              px: 0.5,
              fontWeight: 700,
            }}
          >
            Running sub-agents
          </Typography>
          {runningSubagents.map((subagent) => {
            // Interrupted rows (pre-death) get no cancel; live rows cancel via real ids or a unique progress target.
            const isInterrupted =
              subagentSessionEndedAtMs !== null && (subagent.startedAtMs ?? 0) < subagentSessionEndedAtMs;
            const hasUniqueLiveTarget =
              subagentProgressTargets.filter((t) => t.agentName === subagent.agentName).length === 1;
            const canCancel =
              !isInterrupted && Boolean(subagent.agentId || subagent.childSessionId || hasUniqueLiveTarget);

            return (
              <AgentChatSubagentRow
                key={subagent.rowId}
                subagent={subagent}
                isRunning
                isInterrupted={isInterrupted}
                canCancel={canCancel}
                cancelState={subagentCancelStates[subagent.childSessionId ?? subagent.rowId]}
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
        disabled={
          sessionState === "starting" ||
          isManualCompactPending ||
          (sessionState === "compacting" && compactionReason === "manual")
        }
        slashCommands={slashCommands}
        focusShortcutHint={focusShortcutHint}
        allowEmptySubmit={attachments.length > 0}
        onFilesDrop={handleFilesDrop}
        onPasteBlock={handlePasteBlock}
        fileMentionSearch={handleMentionFileSearch}
        onMentionFile={handleAddFile}
      />
      {attachments.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 0.5 }}>
          {attachments.map((a) => (
            <ComposerAttachmentBlock key={a.id} attachment={a} onRemove={handleRemoveAttachment} />
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 4, px: 1, minHeight: 18 }}>
        {availableModels.length > 0 && (
          <AgentModelSelector
            models={availableModels}
            currentModel={currentModel}
            thinkingLevel={thinkingLevel}
            onModelChange={handleModelChange}
            onThinkingLevelSelect={handleThinkingSelect}
            onAddProvider={openAddProviderDialog}
          />
        )}
        <AgentChatUsageSummaryLabel tabId={tabId} />
        <Tooltip title={t("agentChat.composer.compact")} placement="top">
          <span>
            <IconButton
              aria-label={t("agentChat.composer.compact")}
              onClick={() => {
                void handleCompact();
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
            onText={handleVoiceText}
            disabled={sessionState === "starting"}
            disabledMessage={t("agentChat.voice.unavailableStarting")}
          />
          {isSessionBusy ? (
            <Tooltip title={t("agentChat.composer.stop")} placement="top">
              <span>
                <IconButton
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
                  onClick={() => {
                    void handleSubmitButtonClick();
                  }}
                  disabled={
                    sessionState === "starting" ||
                    isManualCompactPending ||
                    (draft.trim().length === 0 && attachments.length === 0)
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
      <ProviderCredentialDialog {...providerCredentialDialogProps} />
    </Box>
  );
}

/** Renders the interactive agent chat composer and controls. */
export const AgentChatComposerPane = memo(AgentChatComposerPaneComponent);
AgentChatComposerPane.displayName = "AgentChatComposerPane";
