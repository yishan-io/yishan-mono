import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type WorkspaceAgentStatus = "running" | "waiting_input" | "idle";
export type WorkspaceUnreadTone = "success" | "error";

export type WorkspaceAgentIndicatorStoreState = {
  statuses: Record<string, WorkspaceAgentStatus>;
  unreadTones: Record<string, WorkspaceUnreadTone>;
  setStatuses: (statuses: Record<string, WorkspaceAgentStatus>) => void;
  markUnread: (workspaceId: string, tone: WorkspaceUnreadTone) => void;
  clearUnread: (workspaceId: string) => void;
  remove: (workspaceIds: string[]) => void;
};

/** Keeps only entries whose keys are not present in the removal set. */
function omitKeys<T>(record: Record<string, T>, removedIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !removedIds.has(id)));
}

/** Stores workspace-level agent status and unread notifications. */
export const workspaceAgentIndicatorStore = create<WorkspaceAgentIndicatorStoreState>()(
  immer((set) => ({
    statuses: {},
    unreadTones: {},
    setStatuses: (statuses) => {
      set(() => ({
        statuses: { ...statuses },
      }));
    },
    markUnread: (workspaceId, tone) => {
      const trimmedWorkspaceId = workspaceId.trim();
      if (!trimmedWorkspaceId) {
        return;
      }

      set((state) => {
        const previousTone = state.unreadTones[trimmedWorkspaceId];
        const nextTone = previousTone === "error" ? "error" : tone;
        if (previousTone === nextTone) {
          return state;
        }

        return {
          unreadTones: {
            ...state.unreadTones,
            [trimmedWorkspaceId]: nextTone,
          },
        };
      });
    },
    clearUnread: (workspaceId) => {
      const trimmedWorkspaceId = workspaceId.trim();
      if (!trimmedWorkspaceId) {
        return;
      }

      set((state) => {
        if (!(trimmedWorkspaceId in state.unreadTones)) {
          return state;
        }

        return {
          unreadTones: omitKeys(state.unreadTones, new Set([trimmedWorkspaceId])),
        };
      });
    },
    remove: (workspaceIds) => {
      if (workspaceIds.length === 0) {
        return;
      }

      const removedWorkspaceIds = new Set(workspaceIds);
      set((state) => ({
        statuses: omitKeys(state.statuses, removedWorkspaceIds),
        unreadTones: omitKeys(state.unreadTones, removedWorkspaceIds),
      }));
    },
  })),
);
