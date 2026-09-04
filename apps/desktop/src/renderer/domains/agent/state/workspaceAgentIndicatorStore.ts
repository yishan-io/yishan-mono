import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type WorkspaceAgentStatus = "running" | "waiting_input" | "idle";
export type WorkspaceUnreadTone = "success" | "error";

export type WorkspaceAgentIndicatorStoreState = {
  workspaceAgentStatusByWorkspaceId: Record<string, WorkspaceAgentStatus>;
  workspaceUnreadToneByWorkspaceId: Record<string, WorkspaceUnreadTone>;
  setWorkspaceAgentStatusByWorkspaceId: (statusByWorkspaceId: Record<string, WorkspaceAgentStatus>) => void;
  recordWorkspaceUnreadNotification: (workspaceId: string, tone: WorkspaceUnreadTone) => void;
  markWorkspaceNotificationsRead: (workspaceId: string) => void;
  removeWorkspaceIndicatorData: (workspaceIds: string[]) => void;
};

/** Keeps only entries whose keys are not present in the removal set. */
function omitKeys<T>(record: Record<string, T>, removedIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !removedIds.has(id)));
}

/** Stores workspace-level agent status and unread notifications. */
export const workspaceAgentIndicatorStore = create<WorkspaceAgentIndicatorStoreState>()(
  immer((set) => ({
    workspaceAgentStatusByWorkspaceId: {},
    workspaceUnreadToneByWorkspaceId: {},
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
    removeWorkspaceIndicatorData: (workspaceIds) => {
      if (workspaceIds.length === 0) {
        return;
      }

      const removedWorkspaceIds = new Set(workspaceIds);
      set((state) => ({
        workspaceAgentStatusByWorkspaceId: omitKeys(state.workspaceAgentStatusByWorkspaceId, removedWorkspaceIds),
        workspaceUnreadToneByWorkspaceId: omitKeys(state.workspaceUnreadToneByWorkspaceId, removedWorkspaceIds),
      }));
    },
  })),
);
