import { create } from "zustand";
import type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import type { WorkspaceItem } from "./types";

export type WorkspaceCreateProgressStatus = RpcFrontendMessagePayload<"workspaceCreateProgress">["status"];

export type WorkspaceCreateProgressStep = {
  id: string;
  label: string;
  status: WorkspaceCreateProgressStatus;
  message?: string;
};

export type WorkspaceCreateProgressEntry = {
  workspaceId: string;
  steps: WorkspaceCreateProgressStep[];
  updatedAt: string;
  isComplete: boolean;
};

type WorkspaceCreateProgressStoreState = {
  progressByWorkspaceId: Record<string, WorkspaceCreateProgressEntry>;
  startWorkspaceCreateProgress: (workspaceId: string) => void;
  applyWorkspaceCreateProgressEvent: (event: RpcFrontendMessagePayload<"workspaceCreateProgress">) => void;
  finishWorkspaceCreateProgress: (workspaceId: string) => void;
  reconcileHydratedWorkspaceCreateProgress: (
    workspaces: Array<Pick<WorkspaceItem, "id" | "status" | "worktreePath">>,
  ) => void;
};

const DEFAULT_CREATE_STEPS: WorkspaceCreateProgressStep[] = [
  { id: "worktree", label: "Fetch & create worktree", status: "pending" },
  { id: "context", label: "Link project context", status: "pending" },
  { id: "setup", label: "Run setup script", status: "pending" },
  { id: "complete", label: "Prepare workspace", status: "pending" },
];

function createDefaultSteps(): WorkspaceCreateProgressStep[] {
  return DEFAULT_CREATE_STEPS.map((step) => ({ ...step }));
}

export const workspaceCreateProgressStore = create<WorkspaceCreateProgressStoreState>()((set) => ({
  progressByWorkspaceId: {},
  startWorkspaceCreateProgress: (workspaceId) => {
    const normalizedWorkspaceId = workspaceId.trim();
    if (!normalizedWorkspaceId) {
      return;
    }

    set((state) => {
      if (state.progressByWorkspaceId[normalizedWorkspaceId]) {
        return state;
      }

      return {
        progressByWorkspaceId: {
          ...state.progressByWorkspaceId,
          [normalizedWorkspaceId]: {
            workspaceId: normalizedWorkspaceId,
            steps: createDefaultSteps(),
            updatedAt: new Date().toISOString(),
            isComplete: false,
          },
        },
      };
    });
  },
  applyWorkspaceCreateProgressEvent: (event) => {
    const workspaceId = event.workspaceId.trim();
    const stepId = event.stepId.trim();
    if (!workspaceId || !stepId) {
      return;
    }

    set((state) => {
      const existingRecord = state.progressByWorkspaceId[workspaceId];
      const existingSteps = existingRecord?.steps ?? createDefaultSteps();
      const stepIndex = existingSteps.findIndex((step) => step.id === stepId);
      const nextStep: WorkspaceCreateProgressStep = {
        id: stepId,
        label: event.label.trim() || stepId,
        status: event.status,
        message: event.message?.trim() || undefined,
      };
      const nextSteps =
        stepIndex >= 0
          ? existingSteps.map((step, index) => (index === stepIndex ? nextStep : step))
          : [...existingSteps, nextStep];
      return {
        progressByWorkspaceId: {
          ...state.progressByWorkspaceId,
          [workspaceId]: {
            workspaceId,
            steps: nextSteps,
            updatedAt: event.createdAt,
            isComplete: existingRecord?.isComplete ?? false,
          },
        },
      };
    });
  },
  finishWorkspaceCreateProgress: (workspaceId) => {
    const normalizedWorkspaceId = workspaceId.trim();
    if (!normalizedWorkspaceId) {
      return;
    }

    set((state) => {
      const existingRecord = state.progressByWorkspaceId[normalizedWorkspaceId] ?? {
        workspaceId: normalizedWorkspaceId,
        steps: createDefaultSteps(),
        updatedAt: new Date().toISOString(),
        isComplete: false,
      };

      return {
        progressByWorkspaceId: {
          ...state.progressByWorkspaceId,
          [normalizedWorkspaceId]: {
            ...existingRecord,
            isComplete: true,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },
  reconcileHydratedWorkspaceCreateProgress: (workspaces) => {
    set((state) => {
      const nextProgressByWorkspaceId = { ...state.progressByWorkspaceId };
      let changed = false;

      for (const workspace of workspaces) {
        const normalizedWorkspaceId = workspace.id.trim();
        if (!normalizedWorkspaceId || workspace.status !== "active" || !workspace.worktreePath?.trim()) {
          continue;
        }

        const existingRecord = nextProgressByWorkspaceId[normalizedWorkspaceId];
        if (!existingRecord || existingRecord.isComplete) {
          continue;
        }

        nextProgressByWorkspaceId[normalizedWorkspaceId] = {
          ...existingRecord,
          isComplete: true,
          updatedAt: new Date().toISOString(),
        };
        changed = true;
      }

      if (!changed) {
        return state;
      }

      return {
        progressByWorkspaceId: nextProgressByWorkspaceId,
      };
    });
  },
}));
