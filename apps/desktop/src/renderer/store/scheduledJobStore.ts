import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ScheduledJobRecord } from "../api/scheduledJobApi";

type ScheduledJobLoadState = "idle" | "loading" | "loaded" | "error";

type ScheduledJobStoreState = {
  scheduledJobs: ScheduledJobRecord[];
  loadState: ScheduledJobLoadState;
  loadError: string | null;
  /** IDs of jobs with an in-flight pause/resume request. */
  pendingActionIds: string[];
  setScheduledJobs: (jobs: ScheduledJobRecord[]) => void;
  setLoadState: (loadState: ScheduledJobLoadState, loadError?: string | null) => void;
  upsertScheduledJob: (job: ScheduledJobRecord) => void;
  removeScheduledJob: (jobId: string) => void;
  addPendingActionId: (jobId: string) => void;
  removePendingActionId: (jobId: string) => void;
};

/** Stores scheduled job records and their loading state for the scheduled job view. */
export const scheduledJobStore = create<ScheduledJobStoreState>()(
  immer((set) => ({
    scheduledJobs: [],
    loadState: "idle",
    loadError: null,
    pendingActionIds: [],
    setScheduledJobs: (jobs) => {
      set({ scheduledJobs: jobs });
    },
    setLoadState: (loadState, loadError = null) => {
      set({ loadState, loadError });
    },
    upsertScheduledJob: (job) => {
      set((state) => {
        const index = state.scheduledJobs.findIndex((item) => item.id === job.id);
        if (index >= 0) {
          state.scheduledJobs[index] = job;
        } else {
          state.scheduledJobs.push(job);
        }
      });
    },
    removeScheduledJob: (jobId) => {
      set((state) => {
        state.scheduledJobs = state.scheduledJobs.filter((job) => job.id !== jobId);
      });
    },
    addPendingActionId: (jobId) => {
      set((state) => {
        if (!state.pendingActionIds.includes(jobId)) {
          state.pendingActionIds.push(jobId);
        }
      });
    },
    removePendingActionId: (jobId) => {
      set((state) => {
        state.pendingActionIds = state.pendingActionIds.filter((id) => id !== jobId);
      });
    },
  })),
);
