import type { AgentKind } from "@yishan/agent-runtime";
import type { RpcSchema } from "../../shared/contracts/rpcSchema";
import { getDaemonClient } from "../rpc/rpcTransport";
import { chatStore } from "../store/chatStore";
import type { AvailableCommand, AvailableModel, ChatMessage } from "../store/types";

type WorkspaceAgentKind = AgentKind;
type EnsureWorkspaceChatSessionResponse = {
  sessionId: string;
} & {
  capabilities?: {
    models: {
      current?: string;
      availableModels: unknown[];
    };
    commands: unknown[];
    tools: unknown[];
  };
};

const EMPTY_COMMANDS: AvailableCommand[] = [];
const EMPTY_MODELS: AvailableModel[] = [];

/**
 * Extracts slash command metadata from a session update payload.
 * Returns `null` when the payload is not an available-commands update.
 */
function parseAvailableCommandsFromSessionUpdate(update: Record<string, unknown> | null): AvailableCommand[] | null {
  if (!update || update.sessionUpdate !== "available_commands_update") {
    return null;
  }

  const rawCommands = update.availableCommands;
  if (!Array.isArray(rawCommands)) {
    return EMPTY_COMMANDS;
  }

  return rawCommands
    .map((command) => {
      if (!command || typeof command !== "object") {
        return null;
      }
      const record = command as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : "";
      const description = typeof record.description === "string" ? record.description : "";
      return { name, description };
    })
    .filter((command): command is AvailableCommand => command !== null);
}

/**
 * Extracts model metadata from capabilities stream events.
 * Falls back across known field shapes from ACP payload variants.
 */
function parseAvailableModels(event: Record<string, unknown>): AvailableModel[] {
  const modelsRecord =
    typeof event.models === "object" && event.models !== null ? (event.models as Record<string, unknown>) : null;
  const rawModels = Array.isArray(modelsRecord?.availableModels) ? modelsRecord.availableModels : null;
  if (!rawModels) {
    return EMPTY_MODELS;
  }

  return rawModels
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
      return {
        id,
        name,
      };
    })
    .filter((model): model is AvailableModel => Boolean(model && model.id.trim().length > 0));
}

/** Reads the currently selected model id from one capabilities stream event. */
function parseCurrentModel(event: Record<string, unknown>): string | undefined {
  const modelsRecord =
    typeof event.models === "object" && event.models !== null ? (event.models as Record<string, unknown>) : null;
  return typeof modelsRecord?.current === "string" ? modelsRecord.current : undefined;
}

/** Ensures one workspace chat session exists for the active workspace and agent kind. */
export async function ensureChatSession(params: {
  workspaceId: string;
  sessionId?: string;
  title?: string;
  agentKind?: WorkspaceAgentKind;
}): Promise<EnsureWorkspaceChatSessionResponse> {
  const client = await getDaemonClient();
  return (await client.chat.ensureWorkspaceChatSession({
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    title: params.title,
    agentKind: params.agentKind,
  })) as EnsureWorkspaceChatSessionResponse;
}

/** Runs one chat prompt against one workspace session and streams events asynchronously. */
export async function runChatPrompt(params: {
  workspaceId: string;
  sessionId: string;
  prompt: string;
  agentKind?: WorkspaceAgentKind;
  suppressCompletionNotification?: boolean;
}) {
  const client = await getDaemonClient();
  return client.chat.runWorkspaceChatPrompt({
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    prompt: params.prompt,
    agentKind: params.agentKind,
    suppressCompletionNotification: params.suppressCompletionNotification,
  });
}

/** Closes one agent session and optionally deletes its persisted record. */
export async function closeAgentSession(params: { sessionId: string; deleteRecord?: boolean }) {
  const client = await getDaemonClient();
  return client.chat.closeAgentSession({
    sessionId: params.sessionId,
    deleteRecord: params.deleteRecord,
  });
}

/** Returns messages for one chat tab from renderer store state. */
export function getChatMessages(tabId: string): ChatMessage[] {
  return chatStore.getState().getMessages(tabId);
}

/** Appends one or more chat messages for one chat tab in renderer store state. */
export function appendChatMessages(tabId: string, messages: ChatMessage[]) {
  chatStore.getState().appendMessages(tabId, messages);
}

/** Updates one chat message in renderer store state. */
export function updateChatMessage(tabId: string, messageId: string, update: Partial<ChatMessage>) {
  chatStore.getState().updateMessage(tabId, messageId, update);
}

/** Stores available slash commands for one chat tab in renderer store state. */
export function setChatAvailableCommands(tabId: string, commands: AvailableCommand[]) {
  chatStore.getState().setAvailableCommands(tabId, commands);
}

/** Stores available models for one chat tab in renderer store state. */
export function setChatAvailableModels(tabId: string, models: AvailableModel[]) {
  chatStore.getState().setAvailableModels(tabId, models);
}

/** Stores the selected model id for one chat tab in renderer store state. */
export function setChatCurrentModel(tabId: string, modelId: string) {
  chatStore.getState().setCurrentModel(tabId, modelId);
}

/**
 * Builds one chat stream event handler scoped to one workspace session tab.
 * The handler validates target session, updates streamed content, and caches metadata updates.
 */
export function createWorkspaceChatEventHandler(input: {
  tabId: string;
  workspaceId: string;
  expectedSessionId: string;
  getActiveAssistantMessageId: () => string | null;
}) {
  /** Resolves one target assistant message id from active pointer or latest assistant message fallback. */
  const resolveTargetAssistantMessageId = (): string | null => {
    const activeAssistantMessageId = input.getActiveAssistantMessageId();
    if (activeAssistantMessageId) {
      return activeAssistantMessageId;
    }

    const messages = getChatMessages(input.tabId);
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "assistant") {
        return message.id;
      }
    }

    return null;
  };

  return (event: RpcSchema["toFrontend"]["messages"]["chatEvent"]) => {
    if (event.sessionId !== input.expectedSessionId) {
      return;
    }

    const streamEvent = event.event;
    if (streamEvent.type === "capabilities-updated") {
      const streamEventRecord = streamEvent as Record<string, unknown>;
      setChatAvailableModels(input.tabId, parseAvailableModels(streamEventRecord));
      const currentModel = parseCurrentModel(streamEventRecord);
      if (currentModel) {
        setChatCurrentModel(input.tabId, currentModel);
      }
      return;
    }

    if (streamEvent.type === "session-update") {
      const payload =
        typeof streamEvent.update === "object" && streamEvent.update !== null
          ? (streamEvent.update as Record<string, unknown>)
          : null;
      const update =
        typeof payload?.update === "object" && payload.update !== null
          ? (payload.update as Record<string, unknown>)
          : null;
      const content =
        typeof update?.content === "object" && update.content !== null
          ? (update.content as Record<string, unknown>)
          : null;

      const availableCommands = parseAvailableCommandsFromSessionUpdate(update);
      if (availableCommands) {
        setChatAvailableCommands(input.tabId, availableCommands);
        return;
      }

      const assistantMessageId = resolveTargetAssistantMessageId();
      if (!assistantMessageId) {
        return;
      }

      const existingMessage = getChatMessages(input.tabId).find((message) => message.id === assistantMessageId);
      if (!existingMessage) {
        return;
      }

      if (update?.sessionUpdate === "agent_message_chunk" && content?.type === "text") {
        updateChatMessage(input.tabId, assistantMessageId, {
          content: `${existingMessage.content}${typeof content.text === "string" ? content.text : ""}`,
        });
        return;
      }

      if (update?.sessionUpdate === "agent_thought_chunk" && content?.type === "text") {
        updateChatMessage(input.tabId, assistantMessageId, {
          thinking: `${existingMessage.thinking ?? ""}${typeof content.text === "string" ? content.text : ""}`,
        });
      }
      return;
    }

    const assistantMessageId = resolveTargetAssistantMessageId();
    if (!assistantMessageId) {
      if (streamEvent.type === "error") {
        const errorMessage =
          typeof streamEvent.message === "string"
            ? streamEvent.message
            : "Failed to initialize workspace chat session.";
        appendChatMessages(input.tabId, [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${errorMessage}`,
          },
        ]);
      }
      return;
    }

    const existingMessage = getChatMessages(input.tabId).find((message) => message.id === assistantMessageId);
    if (!existingMessage) {
      return;
    }

    if (streamEvent.type === "error") {
      updateChatMessage(input.tabId, assistantMessageId, {
        content: `${existingMessage.content}${existingMessage.content ? "\n" : ""}Error: ${typeof streamEvent.message === "string" ? streamEvent.message : "unknown error"}`,
      });
      return;
    }

    if (streamEvent.type === "log-write-warning") {
      updateChatMessage(input.tabId, assistantMessageId, {
        content: `${existingMessage.content}${existingMessage.content ? "\n" : ""}${typeof streamEvent.text === "string" ? streamEvent.text : ""}`,
      });
    }
  };
}
