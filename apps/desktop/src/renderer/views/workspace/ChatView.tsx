import { Autocomplete, Box, TextField, Typography, createFilterOptions } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageList } from "../../components/MessageList";
import { RichComposer } from "../../components/RichComposer";
import { subscribeWorkspaceChatEvent } from "../../events";
import { useCommands } from "../../hooks/useCommands";
import type { DesktopAgentKind } from "../../helpers/agentSettings";
import { chatStore } from "../../store/chatStore";
import type { AvailableModel, ChatMessage } from "../../store/workspaceStore";

const EMPTY_MESSAGES: ChatMessage[] = [];
const filterModelOptions = createFilterOptions<AvailableModel>({
  stringify: (option) => `${option.name} ${option.id}`,
});

/**
 * Normalizes model capability payloads from ensure-session responses.
 * Supports id/model/empty-string keys seen across provider payload variants.
 */
function resolveAvailableModels(capabilities: {
  models: {
    availableModels: unknown[];
  };
}): AvailableModel[] {
  return capabilities.models.availableModels
    .map((model) => {
      if (!model || typeof model !== "object") {
        return null;
      }

      const record = model as Record<string, unknown>;
      const id =
        (typeof record.id === "string" && record.id) ||
        (typeof record.modelId === "string" && record.modelId) ||
        (typeof record.model === "string" && record.model) ||
        (typeof record[""] === "string" && (record[""] as string)) ||
        "";
      const name = (typeof record.name === "string" && record.name) || id;
      return { id, name };
    })
    .filter((model): model is AvailableModel => Boolean(model && model.id.trim().length > 0));
}

type ChatViewProps = {
  tabId: string;
  workspaceId: string;
  summary: string;
  sessionId: string;
  agentKind?: DesktopAgentKind;
};

/** Renders one workspace chat tab and streams runtime events into local UI state. */
export function ChatView({ tabId, workspaceId, summary, sessionId, agentKind }: ChatViewProps) {
  const { t } = useTranslation();
  const {
    appendChatMessages,
    createWorkspaceChatEventHandler,
    ensureChatSession,
    getChatMessages,
    runChatPrompt,
    setChatAvailableModels,
    setChatCurrentModel,
    updateChatMessage,
  } = useCommands();
  const messagesByTabId = chatStore((state) => state.messagesByTabId);
  const messages = messagesByTabId[tabId] ?? EMPTY_MESSAGES;
  const availableModelsByTabId = chatStore((state) => state.availableModelsByTabId);
  const currentModelByTabId = chatStore((state) => state.currentModelByTabId);
  const [isSending, setIsSending] = useState(false);
  const [resolvedSessionId, setResolvedSessionId] = useState(sessionId);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const availableModels = availableModelsByTabId[tabId] ?? [];
  const currentModelId = currentModelByTabId[tabId];
  const selectedModel =
    (currentModelId ? availableModels.find((model) => model.id === currentModelId) : undefined) ??
    availableModels[0] ??
    null;
  const hasModelMetadata = availableModels.length > 0 || typeof currentModelByTabId[tabId] === "string";

  useEffect(() => {
    setResolvedSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!workspaceId || !tabId || hasModelMetadata) {
      return;
    }

    let cancelled = false;
    void ensureChatSession({
      workspaceId,
      sessionId: resolvedSessionId || tabId,
      title: summary,
      agentKind,
    })
      .then((ensured) => {
        if (!cancelled) {
          setResolvedSessionId(ensured.sessionId);
          if (ensured.capabilities) {
            setChatAvailableModels(tabId, resolveAvailableModels(ensured.capabilities));
            const currentModel = ensured.capabilities.models.current;
            if (typeof currentModel === "string" && currentModel.trim().length > 0) {
              setChatCurrentModel(tabId, currentModel);
            }
          }
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled) {
          appendChatMessages(tabId, [
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Error: ${message}`,
            },
          ]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    agentKind,
    appendChatMessages,
    ensureChatSession,
    hasModelMetadata,
    resolvedSessionId,
    setChatAvailableModels,
    setChatCurrentModel,
    summary,
    tabId,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !tabId) {
      return;
    }

    const expectedSessionId = resolvedSessionId || tabId;
    const handleWorkspaceChatEvent = createWorkspaceChatEventHandler({
      tabId,
      workspaceId,
      expectedSessionId,
      getActiveAssistantMessageId: () => activeAssistantMessageIdRef.current,
    });

    const unsubscribe = subscribeWorkspaceChatEvent(handleWorkspaceChatEvent);

    return () => {
      unsubscribe();
    };
  }, [createWorkspaceChatEventHandler, resolvedSessionId, tabId, workspaceId]);

  useEffect(() => {
    const firstModel = availableModels[0];
    if (!firstModel) {
      return;
    }

    if (!currentModelId || !availableModels.some((model) => model.id === currentModelId)) {
      setChatCurrentModel(tabId, firstModel.id);
    }
  }, [availableModels, currentModelId, setChatCurrentModel, tabId]);

  const canSend = useMemo(
    () => Boolean(workspaceId && resolvedSessionId) && !isSending,
    [isSending, resolvedSessionId, workspaceId],
  );

  const handleSubmit = async (value: string) => {
    const prompt = value.trim();
    if (!prompt || !workspaceId || !resolvedSessionId || isSending) {
      return;
    }

    setIsSending(true);
    const assistantMessageId = crypto.randomUUID();
    activeAssistantMessageIdRef.current = assistantMessageId;

    appendChatMessages(tabId, [
      {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        thinking: "",
      },
    ]);

    try {
      await runChatPrompt({
        workspaceId,
        sessionId: resolvedSessionId,
        prompt,
        agentKind,
      });

      const currentMessages = getChatMessages(tabId);
      const existingMessage = currentMessages.find((msg) => msg.id === assistantMessageId);
      if (existingMessage && existingMessage.content.trim().length === 0) {
        updateChatMessage(tabId, assistantMessageId, {
          content: "(no response)",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentMessages = getChatMessages(tabId);
      const existingMessage = currentMessages.find((msg) => msg.id === assistantMessageId);
      if (existingMessage) {
        updateChatMessage(tabId, assistantMessageId, {
          content: existingMessage.content.trim().length > 0 ? existingMessage.content : `Error: ${message}`,
        });
      }
    } finally {
      activeAssistantMessageIdRef.current = null;
      setIsSending(false);
    }
  };

  /** Switches the active ACP model by sending the built-in `/model` command. */
  const handleModelChange = async (option: AvailableModel | null) => {
    if (!option || !workspaceId || !resolvedSessionId) {
      return;
    }

    if (currentModelId === option.id) {
      return;
    }

    setChatCurrentModel(tabId, option.id);

    try {
      await runChatPrompt({
        workspaceId,
        sessionId: resolvedSessionId,
        prompt: `/model ${option.id}`,
        agentKind,
        suppressCompletionNotification: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendChatMessages(tabId, [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${message}`,
        },
      ]);
    }
  };

  return (
    <>
      <Box sx={{ flex: 1, p: 3, overflowY: "auto" }} data-session-id={resolvedSessionId}>
        <MessageList
          messages={messages}
          minHeight={0}
          emptyState={{
            prompt: t("chat.newPrompt", { agent: "/phoenix" }),
            summary,
          }}
        />
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        <Box
          sx={{
            minHeight: 120,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <RichComposer placeholder={t("chat.composerPlaceholder")} disabled={!canSend} onSubmit={handleSubmit} />
          <Box
            sx={{
              mt: "auto",
              px: 1.5,
              py: 1,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              gap: 2,
              alignItems: "center",
            }}
          >
            <Autocomplete
              size="small"
              options={availableModels}
              value={selectedModel ?? undefined}
              onChange={(_, option) => {
                void handleModelChange(option);
              }}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              getOptionLabel={(option) => option.name}
              filterOptions={filterModelOptions}
              disabled={availableModels.length === 0}
              noOptionsText="No matching models"
              disableClearable
              renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ fontSize: 11 }}>
                  {option.name}
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} placeholder={availableModels.length === 0 ? "No models" : "Search model"} />
              )}
              sx={{
                minWidth: 260,
                "& .MuiInputBase-root": { fontSize: 11, height: 28 },
                "& .MuiAutocomplete-inputRoot": { py: 0.125 },
                "& .MuiAutocomplete-input": { py: 0.25 },
                "& .MuiAutocomplete-option": { fontSize: 11 },
              }}
            />
          </Box>
        </Box>
      </Box>
    </>
  );
}
