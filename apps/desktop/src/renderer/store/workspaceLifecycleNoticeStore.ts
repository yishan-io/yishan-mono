import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { generateId } from "../helpers/generateId";

export type WorkspaceLifecycleScriptWarning = {
  scriptKind: "setup" | "post";
  timedOut: boolean;
  message: string;
  command: string;
  stdoutExcerpt: string;
  stderrExcerpt: string;
  exitCode: number | null;
  signal: string | null;
  logFilePath: string | null;
};

export type WorkspaceLifecycleNotice = {
  id: string;
  kind: "lifecycle";
  workspaceName: string;
  warning: WorkspaceLifecycleScriptWarning;
};

export type WorkspaceErrorNotice = {
  id: string;
  kind: "error";
  title: string;
  message: string;
};

export type WorkspaceNotice = WorkspaceLifecycleNotice | WorkspaceErrorNotice;

type WorkspaceLifecycleNoticeStoreState = {
  noticeQueue: WorkspaceNotice[];
  detailNotice: WorkspaceLifecycleNotice | null;
  enqueueWarnings: (workspaceName: string, warnings: WorkspaceLifecycleScriptWarning[]) => void;
  enqueueError: (title: string, message: string) => void;
  dismissActiveNotice: () => void;
  openActiveNoticeDetails: () => void;
  closeDetailNotice: () => void;
};

function createNoticeId(scriptKind: "setup" | "post"): string {
  return `${scriptKind}-${generateId()}`;
}

/** Stores workspace lifecycle warning queue and selected detail modal payload. */
export const workspaceLifecycleNoticeStore = create<WorkspaceLifecycleNoticeStoreState>()(
  immer((set) => ({
    noticeQueue: [],
    detailNotice: null,
    enqueueWarnings: (workspaceName, warnings) => {
      const normalizedWorkspaceName = workspaceName.trim() || "Workspace";
      const notices = warnings.map((warning) => ({
        id: createNoticeId(warning.scriptKind),
        kind: "lifecycle" as const,
        workspaceName: normalizedWorkspaceName,
        warning,
      }));
      if (notices.length === 0) {
        return;
      }

      set((state) => {
        state.noticeQueue.push(...notices);
      });
    },
    enqueueError: (title, message) => {
      set((state) => {
        state.noticeQueue.push({
          id: `error-${generateId()}`,
          kind: "error",
          title,
          message,
        });
      });
    },
    dismissActiveNotice: () => {
      set((state) => {
        state.noticeQueue = state.noticeQueue.slice(1);
      });
    },
    openActiveNoticeDetails: () => {
      set((state) => {
        const activeNotice = state.noticeQueue[0] ?? null;
        if (!activeNotice || activeNotice.kind !== "lifecycle") {
          return;
        }

        state.noticeQueue = state.noticeQueue.slice(1);
        state.detailNotice = activeNotice;
      });
    },
    closeDetailNotice: () => {
      set({ detailNotice: null });
    },
  })),
);

/** Enqueues lifecycle warnings for workspace create/close in-app notifications. */
export function enqueueWorkspaceLifecycleWarnings(input: {
  workspaceName: string;
  warnings: WorkspaceLifecycleScriptWarning[];
}): void {
  workspaceLifecycleNoticeStore.getState().enqueueWarnings(input.workspaceName, input.warnings);
}

export function enqueueWorkspaceErrorNotice(input: { title: string; message: string }): void {
  workspaceLifecycleNoticeStore.getState().enqueueError(input.title, input.message);
}
