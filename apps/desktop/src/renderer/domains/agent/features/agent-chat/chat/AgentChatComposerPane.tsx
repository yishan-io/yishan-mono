import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { displaySettingsStore, keybindingSettingsStore } from "@renderer/domains/settings";
import { TAB_FOCUS_REQUEST_EVENT, consumeTabFocus, getTabFocusRequest, tabStore } from "@renderer/domains/workbench";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowUp, LuShrink } from "react-icons/lu";
import { useShallow } from "zustand/react/shallow";
import { getSupportedKeyBindings } from "../../../../../shortcuts/keybindings";
import { type AgentModel, isAgentSessionBusy } from "../../../chat/agentChatTypes";
import { getCompactContextPercent } from "../../../chat/agentChatUsageSummary";
import { agentChatStore } from "../../../state/agentChatStore";
import { ProviderCredentialDialog } from "../../provider-credentials/ProviderCredentialDialog";
import { AgentModelSelector } from "../../select-model/AgentModelSelector";
import { AgentChatSubagentRow } from "../session/AgentChatSubagentRow";
import { AgentChatUsageSummaryLabel } from "../session/AgentChatUsageSummaryLabel";
import { AgentChatComposerFooter } from "./AgentChatComposerFooter";
import { AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX } from "./AgentChatContentLayout";
import { AgentChatSubagentList } from "./AgentChatSubagentList";
import { AgentChatVoiceButton } from "./AgentChatVoiceButton";
import { ComposerAttachmentBlock } from "./composer/ComposerAttachmentBlock";
import { RichComposer } from "./composer/RichComposer";
import { useAgentChatComposerDraft } from "./useAgentChatComposerDraft";
import { useAgentChatProviderAdd } from "./useAgentChatProviderAdd";
import { useAgentChatSlashCommands } from "./useAgentChatSlashCommands";
import { useAgentChatSubagentActions } from "./useAgentChatSubagentActions";

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
  const agentChatWidth = displaySettingsStore((state) => state.agentChatWidth);
  const isFixedWidth = agentChatWidth === "fixed";
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
  } = agentChatStore(
    useShallow((state) => {
      const session = state.sessionsByTabId[tabId];
      return {
        sessionId: session?.sessionId ?? null,
        sessionState: session?.state ?? "starting",
        subagentSessionEndedAtMs: session?.subagentSessionEndedAtMs ?? null,
        compactionReason: session?.compactionReason ?? null,
        availableModels: session?.availableModels ?? [],
        currentModel: session?.currentModel ?? null,
        thinkingLevel: session?.thinkingLevel ?? "medium",
        messageCount: session?.messages.length ?? 0,
        hasStreamingMessage: Boolean(session?.streamingMessage),
        contextPercent: getCompactContextPercent(
          session?.messages ?? [],
          session?.currentModel ?? null,
          session?.sessionStats ?? null,
        ),
      };
    }),
  );
  const { runningSubagents, subagentProgressTargets, subagentCancelStates, handleOpenSubagent, handleCancelSubagent } =
    useAgentChatSubagentActions({ tabId, workspaceId, cwd, paneId, sessionId });
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
  const isSessionBusy = isAgentSessionBusy(sessionState);
  const canManuallyCompact = contextPercent >= 50;
  const composerContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    draft,
    setDraft,
    attachments,
    isManualCompactPending,
    handleSubmit,
    handleFilesDrop,
    handleMentionFileSearch,
    handlePasteBlock,
    handleAddFile,
    handleRemoveAttachment,
    handleAbort,
    handleCompact,
    handleSubmitButtonClick,
    handleVoiceText,
    handleModelChange,
    handleThinkingSelect,
  } = useAgentChatComposerDraft({
    tabId,
    workspaceId,
    sessionId,
    sessionState,
    messageCount,
    hasStreamingMessage,
    userRenamed: agentChatTab?.data.userRenamed,
    slashCommands,
  });

  const focusComposer = useCallback(() => {
    composerContainerRef.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus();
  }, []);

  useEffect(() => {
    const handleFocusRequest = (event: Event) => {
      const request = event as CustomEvent<{ tabId: string; target?: string }>;
      if (request.detail.target !== "agent-composer" || request.detail.tabId !== tabId) {
        return;
      }
      if (sessionState === "starting" || !isActive) {
        return;
      }

      const requestKind = getTabFocusRequest(tabId)?.kind;
      if (requestKind === "auto" && !isReadyForAutoFocus) {
        return;
      }

      focusComposer();
      if (requestKind) {
        consumeTabFocus(tabId);
      }
    };

    window.addEventListener(TAB_FOCUS_REQUEST_EVENT, handleFocusRequest);
    return () => {
      window.removeEventListener(TAB_FOCUS_REQUEST_EVENT, handleFocusRequest);
    };
  }, [focusComposer, isActive, isReadyForAutoFocus, sessionState, tabId]);

  useEffect(() => {
    const request = getTabFocusRequest(tabId);
    const requestKind = request?.target === "agent-composer" ? request.kind : undefined;
    if (!requestKind || sessionState === "starting" || !isActive || (requestKind === "auto" && !isReadyForAutoFocus)) {
      return;
    }

    focusComposer();
    consumeTabFocus(tabId);
  }, [focusComposer, isActive, isReadyForAutoFocus, sessionState, tabId]);

  const { openAddProviderDialog, providerCredentialDialogProps } = useAgentChatProviderAdd({
    tabId,
    workspaceId,
    cwd,
    paneId,
    sessionId,
    sessionState,
  });

  return (
    <Box
      ref={composerContainerRef}
      sx={{
        border: isFixedWidth ? 1 : 0,
        borderTop: isFixedWidth ? 1 : 0,
        borderColor: "divider",
        borderRadius: isFixedWidth ? 2 : 0,
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        ...(isFixedWidth
          ? {
              alignSelf: "center",
              maxWidth: AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX,
              width: "calc(100% - 32px)",
            }
          : { borderTop: 1, width: "100%" }),
      }}
    >
      <AgentChatSubagentList
        runningSubagents={runningSubagents}
        subagentSessionEndedAtMs={subagentSessionEndedAtMs}
        subagentProgressTargets={subagentProgressTargets}
        subagentCancelStates={subagentCancelStates}
        onOpenSubagent={handleOpenSubagent}
        onCancelSubagent={handleCancelSubagent}
      />
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
      <AgentChatComposerFooter
        tabId={tabId}
        availableModels={availableModels}
        currentModel={currentModel}
        thinkingLevel={thinkingLevel}
        onModelChange={handleModelChange}
        onThinkingLevelSelect={handleThinkingSelect}
        onAddProvider={openAddProviderDialog}
        sessionState={sessionState}
        canManuallyCompact={canManuallyCompact}
        isManualCompactPending={isManualCompactPending}
        isSessionBusy={isSessionBusy}
        draft={draft}
        attachmentCount={attachments.length}
        onCompact={handleCompact}
        onAbort={handleAbort}
        onSubmitButtonClick={handleSubmitButtonClick}
        onVoiceText={handleVoiceText}
      />
      <ProviderCredentialDialog {...providerCredentialDialogProps} />
    </Box>
  );
}

/** Renders the interactive agent chat composer and controls. */
export const AgentChatComposerPane = memo(AgentChatComposerPaneComponent);
AgentChatComposerPane.displayName = "AgentChatComposerPane";
