import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskFilters,
  LocalTaskLoadState,
  LocalTaskWorkspaceLink,
} from "../localTaskTypes";

/** Mutable Local Task state and synchronous mutation actions. */
export type LocalTaskStoreState = {
  taskById: Record<string, LocalTask>;
  hubTasks: LocalTask[];
  hubFilters: LocalTaskFilters;
  hubSearchQuery: string;
  activeTaskCount: number;
  hubLoadState: LocalTaskLoadState;
  hubError: string | null;
  tagSuggestions: string[];
  tagSuggestionsLoadState: LocalTaskLoadState;
  tagSuggestionsError: string | null;
  selectedWorkspaceId: string | null;
  selectedWorkspaceTaskId: string | null;
  workspaceTasks: LocalTask[];
  workspaceLinks: LocalTaskWorkspaceLink[];
  workspaceActiveTaskCount: number;
  workspaceLoadState: LocalTaskLoadState;
  workspaceError: string | null;
  linkCandidateWorkspaceId: string | null;
  linkCandidateTasks: LocalTask[];
  linkCandidateLoadState: LocalTaskLoadState;
  linkCandidateError: string | null;
  taskLoadStateByTaskId: Record<string, LocalTaskLoadState>;
  taskErrorByTaskId: Record<string, string | null>;
  contextByTaskId: Record<string, LocalTaskContextDetails>;
  contextLoadStateByTaskId: Record<string, LocalTaskLoadState>;
  contextErrorByTaskId: Record<string, string | null>;
  taskLinksByTaskId: Record<string, LocalTaskWorkspaceLink[]>;
  taskLinksLoadStateByTaskId: Record<string, LocalTaskLoadState>;
  taskLinksErrorByTaskId: Record<string, string | null>;
  pendingMutationCount: number;
  isMutationLoading: boolean;
  mutationError: string | null;
  setHubFilters: (filters: LocalTaskFilters) => void;
  setHubSearchQuery: (query: string) => void;
  beginTagSuggestionsLoad: () => number;
  setTagSuggestions: (requestId: number, tags: string[]) => void;
  setTagSuggestionsError: (requestId: number, error: string) => void;
  beginActiveTaskCountLoad: () => number;
  setActiveTaskCount: (requestId: number, activeTaskCount: number) => void;
  beginHubLoad: () => number;
  setHubResults: (requestId: number, tasks: LocalTask[], activeTaskCount: number) => void;
  setHubError: (requestId: number, error: string) => void;
  beginWorkspaceLoad: (workspaceId: string) => number;
  clearSelectedWorkspace: () => void;
  selectWorkspaceTask: (taskId: string) => void;
  setWorkspaceData: (
    requestId: number,
    workspaceId: string,
    tasks: LocalTask[],
    links: LocalTaskWorkspaceLink[],
  ) => void;
  setWorkspaceError: (requestId: number, workspaceId: string, error: string) => void;
  beginLinkCandidateLoad: (workspaceId: string) => number;
  setLinkCandidates: (requestId: number, workspaceId: string, tasks: LocalTask[]) => void;
  setLinkCandidateError: (requestId: number, workspaceId: string, error: string) => void;
  beginTaskLoad: (taskId: string) => number;
  setTaskEntity: (requestId: number, taskId: string, task: LocalTask) => void;
  setTaskError: (requestId: number, taskId: string, error: string) => void;
  beginContextLoad: (taskId: string) => number;
  setContext: (requestId: number, taskId: string, context: LocalTaskContextDetails) => void;
  setContextError: (requestId: number, taskId: string, error: string) => void;
  beginTaskLinksLoad: (taskId: string) => number;
  invalidateTaskLinksLoads: (taskIds: string[]) => void;
  setTaskLinks: (requestId: number, taskId: string, links: LocalTaskWorkspaceLink[]) => void;
  setTaskLinksError: (requestId: number, taskId: string, error: string) => void;
  beginMutation: () => void;
  finishMutation: (error?: string) => void;
  upsertTaskEntity: (task: LocalTask) => void;
};

/** Stores Local Task entities, projections, context, links, and operation state. */
export const localTaskStore = create<LocalTaskStoreState>()(
  immer((set) => {
    let activeTaskCountRequestGeneration = 0;
    let hubRequestGeneration = 0;
    let workspaceRequestGeneration = 0;
    let tagSuggestionsRequestGeneration = 0;
    let linkCandidateRequestGeneration = 0;
    const taskRequestGenerationByTaskId: Record<string, number> = {};
    const taskEntityRevisionByTaskId: Record<string, number> = {};
    const taskLoadRevisionByTaskId: Record<string, number> = {};
    const contextRequestGenerationByTaskId: Record<string, number> = {};
    const taskLinksRequestGenerationByTaskId: Record<string, number> = {};

    const writeTaskEntity = (state: LocalTaskStoreState, task: LocalTask) => {
      state.taskById[task.id] = task;
      taskEntityRevisionByTaskId[task.id] = (taskEntityRevisionByTaskId[task.id] ?? 0) + 1;
    };

    return {
      taskById: {},
      hubTasks: [],
      hubFilters: {},
      hubSearchQuery: "",
      activeTaskCount: 0,
      hubLoadState: "idle",
      hubError: null,
      tagSuggestions: [],
      tagSuggestionsLoadState: "idle",
      tagSuggestionsError: null,
      selectedWorkspaceId: null,
      selectedWorkspaceTaskId: null,
      workspaceTasks: [],
      workspaceLinks: [],
      workspaceActiveTaskCount: 0,
      workspaceLoadState: "idle",
      workspaceError: null,
      linkCandidateWorkspaceId: null,
      linkCandidateTasks: [],
      linkCandidateLoadState: "idle",
      linkCandidateError: null,
      taskLoadStateByTaskId: {},
      taskErrorByTaskId: {},
      contextByTaskId: {},
      contextLoadStateByTaskId: {},
      contextErrorByTaskId: {},
      taskLinksByTaskId: {},
      taskLinksLoadStateByTaskId: {},
      taskLinksErrorByTaskId: {},
      pendingMutationCount: 0,
      isMutationLoading: false,
      mutationError: null,
      setHubFilters: (hubFilters) => set({ hubFilters }),
      setHubSearchQuery: (hubSearchQuery) => set({ hubSearchQuery }),
      beginTagSuggestionsLoad: () => {
        const requestId = ++tagSuggestionsRequestGeneration;
        set({ tagSuggestionsLoadState: "loading", tagSuggestionsError: null });
        return requestId;
      },
      setTagSuggestions: (requestId, tagSuggestions) => {
        if (requestId === tagSuggestionsRequestGeneration) {
          set({ tagSuggestions, tagSuggestionsLoadState: "loaded", tagSuggestionsError: null });
        }
      },
      setTagSuggestionsError: (requestId, tagSuggestionsError) => {
        if (requestId === tagSuggestionsRequestGeneration) {
          set({ tagSuggestionsLoadState: "error", tagSuggestionsError });
        }
      },
      beginActiveTaskCountLoad: () => ++activeTaskCountRequestGeneration,
      setActiveTaskCount: (requestId, activeTaskCount) => {
        if (requestId === activeTaskCountRequestGeneration) set({ activeTaskCount });
      },
      beginHubLoad: () => {
        const requestId = ++activeTaskCountRequestGeneration;
        hubRequestGeneration = requestId;
        set({ hubLoadState: "loading", hubError: null });
        return requestId;
      },
      setHubResults: (requestId, hubTasks, activeTaskCount) => {
        if (requestId !== hubRequestGeneration) return;
        set((state) => {
          state.hubTasks = hubTasks;
          if (requestId === activeTaskCountRequestGeneration) state.activeTaskCount = activeTaskCount;
          state.hubLoadState = "loaded";
          state.hubError = null;
          for (const task of hubTasks) writeTaskEntity(state, task);
        });
      },
      setHubError: (requestId, hubError) => {
        if (requestId === hubRequestGeneration) set({ hubLoadState: "error", hubError });
      },
      beginWorkspaceLoad: (workspaceId) => {
        const requestId = ++workspaceRequestGeneration;
        set((state) => {
          if (state.selectedWorkspaceId !== workspaceId) {
            state.workspaceTasks = [];
            state.selectedWorkspaceTaskId = null;
            state.workspaceLinks = [];
            state.workspaceActiveTaskCount = 0;
          }
          state.selectedWorkspaceId = workspaceId;
          state.workspaceLoadState = "loading";
          state.workspaceError = null;
        });
        return requestId;
      },
      clearSelectedWorkspace: () => {
        workspaceRequestGeneration += 1;
        set({
          selectedWorkspaceId: null,
          selectedWorkspaceTaskId: null,
          workspaceTasks: [],
          workspaceLinks: [],
          workspaceActiveTaskCount: 0,
          workspaceLoadState: "idle",
          workspaceError: null,
        });
      },
      setWorkspaceData: (requestId, workspaceId, workspaceTasks, workspaceLinks) => {
        if (requestId !== workspaceRequestGeneration) return;
        set((state) => {
          if (state.selectedWorkspaceId !== workspaceId) return;
          const linkedTaskIds = new Set(workspaceLinks.map((link) => link.localTaskId));
          if (!state.selectedWorkspaceTaskId || !linkedTaskIds.has(state.selectedWorkspaceTaskId)) {
            state.selectedWorkspaceTaskId = workspaceLinks[0]?.localTaskId ?? null;
          }
          state.workspaceTasks = workspaceTasks;
          state.workspaceLinks = workspaceLinks;
          state.workspaceActiveTaskCount = workspaceTasks.filter((task) => task.status === "active").length;
          state.workspaceLoadState = "loaded";
          state.workspaceError = null;
          for (const task of workspaceTasks) writeTaskEntity(state, task);
        });
      },
      selectWorkspaceTask: (selectedWorkspaceTaskId) => set({ selectedWorkspaceTaskId }),
      setWorkspaceError: (requestId, workspaceId, workspaceError) => {
        if (requestId !== workspaceRequestGeneration) return;
        set((state) => {
          if (state.selectedWorkspaceId !== workspaceId) return;
          state.workspaceLoadState = "error";
          state.workspaceError = workspaceError;
        });
      },
      beginLinkCandidateLoad: (workspaceId) => {
        const requestId = ++linkCandidateRequestGeneration;
        set((state) => {
          if (state.linkCandidateWorkspaceId !== workspaceId) state.linkCandidateTasks = [];
          state.linkCandidateWorkspaceId = workspaceId;
          state.linkCandidateLoadState = "loading";
          state.linkCandidateError = null;
        });
        return requestId;
      },
      setLinkCandidates: (requestId, workspaceId, linkCandidateTasks) => {
        if (requestId !== linkCandidateRequestGeneration) return;
        set((state) => {
          if (state.linkCandidateWorkspaceId !== workspaceId) return;
          state.linkCandidateTasks = linkCandidateTasks;
          state.linkCandidateLoadState = "loaded";
          state.linkCandidateError = null;
          for (const task of linkCandidateTasks) writeTaskEntity(state, task);
        });
      },
      setLinkCandidateError: (requestId, workspaceId, linkCandidateError) => {
        if (requestId !== linkCandidateRequestGeneration) return;
        set((state) => {
          if (state.linkCandidateWorkspaceId !== workspaceId) return;
          state.linkCandidateLoadState = "error";
          state.linkCandidateError = linkCandidateError;
        });
      },
      beginTaskLoad: (taskId) => {
        const requestId = (taskRequestGenerationByTaskId[taskId] ?? 0) + 1;
        taskRequestGenerationByTaskId[taskId] = requestId;
        taskLoadRevisionByTaskId[taskId] = taskEntityRevisionByTaskId[taskId] ?? 0;
        set((state) => {
          state.taskLoadStateByTaskId[taskId] = "loading";
          state.taskErrorByTaskId[taskId] = null;
        });
        return requestId;
      },
      setTaskEntity: (requestId, taskId, task) => {
        if (requestId !== taskRequestGenerationByTaskId[taskId]) return;
        if (taskLoadRevisionByTaskId[taskId] !== (taskEntityRevisionByTaskId[taskId] ?? 0)) return;
        set((state) => {
          writeTaskEntity(state, task);
          state.taskLoadStateByTaskId[taskId] = "loaded";
          state.taskErrorByTaskId[taskId] = null;
        });
      },
      setTaskError: (requestId, taskId, error) => {
        if (requestId !== taskRequestGenerationByTaskId[taskId]) return;
        if (taskLoadRevisionByTaskId[taskId] !== (taskEntityRevisionByTaskId[taskId] ?? 0)) return;
        set((state) => {
          state.taskLoadStateByTaskId[taskId] = "error";
          state.taskErrorByTaskId[taskId] = error;
        });
      },
      beginContextLoad: (taskId) => {
        const requestId = (contextRequestGenerationByTaskId[taskId] ?? 0) + 1;
        contextRequestGenerationByTaskId[taskId] = requestId;
        set((state) => {
          state.contextLoadStateByTaskId[taskId] = "loading";
          state.contextErrorByTaskId[taskId] = null;
        });
        return requestId;
      },
      setContext: (requestId, taskId, context) => {
        if (requestId !== contextRequestGenerationByTaskId[taskId]) return;
        set((state) => {
          state.contextByTaskId[taskId] = context;
          state.contextLoadStateByTaskId[taskId] = "loaded";
          state.contextErrorByTaskId[taskId] = null;
        });
      },
      setContextError: (requestId, taskId, error) => {
        if (requestId !== contextRequestGenerationByTaskId[taskId]) return;
        set((state) => {
          state.contextLoadStateByTaskId[taskId] = "error";
          state.contextErrorByTaskId[taskId] = error;
        });
      },
      beginTaskLinksLoad: (taskId) => {
        const requestId = (taskLinksRequestGenerationByTaskId[taskId] ?? 0) + 1;
        taskLinksRequestGenerationByTaskId[taskId] = requestId;
        set((state) => {
          state.taskLinksLoadStateByTaskId[taskId] = "loading";
          state.taskLinksErrorByTaskId[taskId] = null;
        });
        return requestId;
      },
      invalidateTaskLinksLoads: (taskIds) => {
        for (const taskId of taskIds) {
          taskLinksRequestGenerationByTaskId[taskId] = (taskLinksRequestGenerationByTaskId[taskId] ?? 0) + 1;
        }
        set((state) => {
          for (const taskId of taskIds) {
            if (state.taskLinksLoadStateByTaskId[taskId] === "loading") {
              state.taskLinksLoadStateByTaskId[taskId] = "idle";
            }
          }
        });
      },
      setTaskLinks: (requestId, taskId, links) => {
        if (requestId !== taskLinksRequestGenerationByTaskId[taskId]) return;
        set((state) => {
          state.taskLinksByTaskId[taskId] = links;
          state.taskLinksLoadStateByTaskId[taskId] = "loaded";
          state.taskLinksErrorByTaskId[taskId] = null;
        });
      },
      setTaskLinksError: (requestId, taskId, error) => {
        if (requestId !== taskLinksRequestGenerationByTaskId[taskId]) return;
        set((state) => {
          state.taskLinksLoadStateByTaskId[taskId] = "error";
          state.taskLinksErrorByTaskId[taskId] = error;
        });
      },
      beginMutation: () => {
        set((state) => {
          if (state.pendingMutationCount === 0) state.mutationError = null;
          state.pendingMutationCount += 1;
          state.isMutationLoading = true;
        });
      },
      finishMutation: (error) => {
        set((state) => {
          state.pendingMutationCount = Math.max(0, state.pendingMutationCount - 1);
          state.isMutationLoading = state.pendingMutationCount > 0;
          if (error !== undefined) state.mutationError = error;
        });
      },
      upsertTaskEntity: (task) => {
        set((state) => writeTaskEntity(state, task));
      },
    };
  }),
);
