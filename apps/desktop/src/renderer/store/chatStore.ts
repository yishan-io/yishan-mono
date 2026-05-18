import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AvailableCommand, AvailableModel, ChatMessage } from "./chatTypes";

export type WorkspaceAgentStatus = "running" | "waiting_input" | "idle";
export type WorkspaceUnreadTone = "success" | "error";

type ChatStoreState = {
  messagesByTabId: Record<string, ChatMessage[]>;
  availableCommandsByTabId: Record<string, AvailableCommand[]>;
  availableModelsByTabId: Record<string, AvailableModel[]>;
  currentModelByTabId: Record<string, string>;
  workspaceAgentStatusByWorkspaceId: Record<string, WorkspaceAgentStatus>;
  workspaceUnreadToneByWorkspaceId: Record<string, WorkspaceUnreadTone>;
  getMessages: (tabId: string) => ChatMessage[];
  appendMessages: (tabId: string, messages: ChatMessage[]) => void;
  updateMessage: (tabId: string, messageId: string, update: Partial<ChatMessage>) => void;
  clearMessages: (tabId: string) => void;
  getAvailableCommands: (tabId: string) => AvailableCommand[];
  setAvailableCommands: (tabId: string, commands: AvailableCommand[]) => void;
  clearAvailableCommands: (tabId: string) => void;
  getAvailableModels: (tabId: string) => AvailableModel[];
  setAvailableModels: (tabId: string, models: AvailableModel[]) => void;
  clearAvailableModels: (tabId: string) => void;
  getCurrentModel: (tabId: string) => string | undefined;
  setCurrentModel: (tabId: string, modelId: string) => void;
  clearCurrentModel: (tabId: string) => void;
  setWorkspaceAgentStatusByWorkspaceId: (statusByWorkspaceId: Record<string, WorkspaceAgentStatus>) => void;
  recordWorkspaceUnreadNotification: (workspaceId: string, tone: WorkspaceUnreadTone) => void;
  markWorkspaceNotificationsRead: (workspaceId: string) => void;
  removeTabData: (tabIds: string[]) => void;
  removeWorkspaceTaskCounts: (workspaceIds: string[]) => void;
};

const MAX_MESSAGES_PER_TAB = 300;

/** Keeps only entries whose keys are not present in the removal set. */
function omitKeys<T>(record: Record<string, T>, removedIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !removedIds.has(id)));
}

/** Normalizes command payloads before storing. */
function sanitizeAvailableCommands(commands: AvailableCommand[]): AvailableCommand[] {
  return commands
    .filter((command) => command.name.trim().length > 0)
    .map((command) => ({
      name: command.name.trim(),
      description: command.description.trim(),
    }));
}

/** Normalizes model payloads before storing. */
function sanitizeAvailableModels(models: AvailableModel[]): AvailableModel[] {
  return models
    .map((model) => {
      const id = model.id.trim();
      const name = model.name.trim();
      return {
        id,
        name: name.length > 0 ? name : id,
      };
    })
    .filter((model) => model.id.length > 0);
}

/** Stores chat/session data with explicit cleanup orchestration from commands. */
export const chatStore = create<ChatStoreState>()(
  immer((set, get) => {
    return {
      messagesByTabId: {},
      availableCommandsByTabId: {},
      availableModelsByTabId: {},
      currentModelByTabId: {},
      workspaceAgentStatusByWorkspaceId: {},
      workspaceUnreadToneByWorkspaceId: {},
      getMessages: (tabId) => get().messagesByTabId[tabId] ?? [],
      appendMessages: (tabId, messages) => {
        set((state) => {
          const current = state.messagesByTabId[tabId] ?? [];
          const combined = [...current, ...messages];
          const trimmed = combined.length > MAX_MESSAGES_PER_TAB ? combined.slice(-MAX_MESSAGES_PER_TAB) : combined;
          return {
            messagesByTabId: {
              ...state.messagesByTabId,
              [tabId]: trimmed,
            },
          };
        });
      },
      updateMessage: (tabId, messageId, update) => {
        set((state) => {
          const current = state.messagesByTabId[tabId];
          if (!current) {
            return state;
          }

          return {
            messagesByTabId: {
              ...state.messagesByTabId,
              [tabId]: current.map((msg) => (msg.id === messageId ? { ...msg, ...update } : msg)),
            },
          };
        });
      },
      clearMessages: (tabId) => {
        set((state) => ({
          messagesByTabId: omitKeys(state.messagesByTabId, new Set([tabId])),
        }));
      },
      getAvailableCommands: (tabId) => get().availableCommandsByTabId[tabId] ?? [],
      setAvailableCommands: (tabId, commands) => {
        const nextCommands = sanitizeAvailableCommands(commands);
        set((state) => ({
          availableCommandsByTabId: {
            ...state.availableCommandsByTabId,
            [tabId]: nextCommands,
          },
        }));
      },
      clearAvailableCommands: (tabId) => {
        set((state) => ({
          availableCommandsByTabId: omitKeys(state.availableCommandsByTabId, new Set([tabId])),
        }));
      },
      getAvailableModels: (tabId) => get().availableModelsByTabId[tabId] ?? [],
      setAvailableModels: (tabId, models) => {
        const nextModels = sanitizeAvailableModels(models);
        set((state) => ({
          availableModelsByTabId: {
            ...state.availableModelsByTabId,
            [tabId]: nextModels,
          },
          currentModelByTabId:
            nextModels.length === 0 ? omitKeys(state.currentModelByTabId, new Set([tabId])) : state.currentModelByTabId,
        }));
      },
      clearAvailableModels: (tabId) => {
        set((state) => ({
          availableModelsByTabId: omitKeys(state.availableModelsByTabId, new Set([tabId])),
        }));
      },
      getCurrentModel: (tabId) => get().currentModelByTabId[tabId],
      setCurrentModel: (tabId, modelId) => {
        const nextModelId = modelId.trim();
        if (nextModelId.length === 0) {
          return;
        }

        set((state) => ({
          currentModelByTabId: {
            ...state.currentModelByTabId,
            [tabId]: nextModelId,
          },
        }));
      },
      clearCurrentModel: (tabId) => {
        set((state) => ({
          currentModelByTabId: omitKeys(state.currentModelByTabId, new Set([tabId])),
        }));
      },
      setWorkspaceAgentStatusByWorkspaceId: (statusByWorkspaceId) => {
        set(() => ({
          workspaceAgentStatusByWorkspaceId: { ...statusByWorkspaceId },
        }));
      },
      recordWorkspaceUnreadNotification: (workspaceId, tone) => {
        const trimmedWorkspaceId = workspaceId.trim();
        if (!trimmedWorkspaceId) {
          return;
        }

        set((state) => {
          const previousTone = state.workspaceUnreadToneByWorkspaceId[trimmedWorkspaceId];
          const nextTone = previousTone === "error" ? "error" : tone;
          if (previousTone === nextTone) {
            return state;
          }

          return {
            workspaceUnreadToneByWorkspaceId: {
              ...state.workspaceUnreadToneByWorkspaceId,
              [trimmedWorkspaceId]: nextTone,
            },
          };
        });
      },
      markWorkspaceNotificationsRead: (workspaceId) => {
        const trimmedWorkspaceId = workspaceId.trim();
        if (!trimmedWorkspaceId) {
          return;
        }

        set((state) => {
          if (!(trimmedWorkspaceId in state.workspaceUnreadToneByWorkspaceId)) {
            return state;
          }

          return {
            workspaceUnreadToneByWorkspaceId: omitKeys(
              state.workspaceUnreadToneByWorkspaceId,
              new Set([trimmedWorkspaceId]),
            ),
          };
        });
      },
      removeTabData: (tabIds) => {
        if (tabIds.length === 0) {
          return;
        }

        const removedTabIds = new Set(tabIds);
        set((state) => ({
          messagesByTabId: omitKeys(state.messagesByTabId, removedTabIds),
          availableCommandsByTabId: omitKeys(state.availableCommandsByTabId, removedTabIds),
          availableModelsByTabId: omitKeys(state.availableModelsByTabId, removedTabIds),
          currentModelByTabId: omitKeys(state.currentModelByTabId, removedTabIds),
        }));
      },
      removeWorkspaceTaskCounts: (workspaceIds) => {
        if (workspaceIds.length === 0) {
          return;
        }

        const removedWorkspaceIds = new Set(workspaceIds);
        set((state) => ({
          workspaceAgentStatusByWorkspaceId: omitKeys(state.workspaceAgentStatusByWorkspaceId, removedWorkspaceIds),
          workspaceUnreadToneByWorkspaceId: omitKeys(state.workspaceUnreadToneByWorkspaceId, removedWorkspaceIds),
        }));
      },
    };
  }),
);
