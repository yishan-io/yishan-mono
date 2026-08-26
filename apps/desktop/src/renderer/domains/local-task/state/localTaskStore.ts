import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { LocalTask, LocalTaskTagCatalogEntry, LocalTaskTagRef } from "../localTaskTypes";
import type { LocalTaskStoreState } from "./localTaskStoreState";

export type { LocalTaskStoreState } from "./localTaskStoreState";

/** Stores Local Task entities, projections, context, links, and operation state. */
export const localTaskStore = create<LocalTaskStoreState>()(
  immer((set) => {
    let progressingTaskCountRequestGeneration = 0;
    let hubRequestGeneration = 0;
    let workspaceRequestGeneration = 0;
    let tagSuggestionsRequestGeneration = 0;
    let linkCandidateRequestGeneration = 0;
    const taskRequestGenerationByTaskId: Record<string, number> = {};
    const taskEntityRevisionByTaskId: Record<string, number> = {};
    const taskLoadRevisionByTaskId: Record<string, number> = {};
    const contextRequestGenerationByTaskId: Record<string, number> = {};
    const detailsRequestGenerationByTaskId: Record<string, number> = {};
    const taskLinksRequestGenerationByTaskId: Record<string, number> = {};

    const writeTaskEntity = (state: LocalTaskStoreState, task: LocalTask) => {
      state.taskById[task.id] = task;
      taskEntityRevisionByTaskId[task.id] = (taskEntityRevisionByTaskId[task.id] ?? 0) + 1;
    };

    const reconcileTaskTagRefs = (
      task: LocalTask,
      removedTagId: string,
      renamedTag?: LocalTaskTagCatalogEntry,
    ): LocalTask => {
      let hasChanged = false;
      const tagRefs: LocalTaskTagRef[] = [];
      const tagIds = new Set<string>();
      for (const tagRef of task.tagRefs) {
        if (!renamedTag && tagRef.id === removedTagId) {
          hasChanged = true;
          continue;
        }
        const reconciledTagRef =
          renamedTag && (tagRef.id === removedTagId || tagRef.id === renamedTag.id)
            ? { id: renamedTag.id, name: renamedTag.name }
            : tagRef;
        if (tagIds.has(reconciledTagRef.id)) {
          hasChanged = true;
          continue;
        }
        if (reconciledTagRef !== tagRef) hasChanged = true;
        tagIds.add(reconciledTagRef.id);
        tagRefs.push(reconciledTagRef);
      }
      return hasChanged ? { ...task, tagRefs } : task;
    };

    const reconcileCachedTaskTagRefs = (
      state: LocalTaskStoreState,
      removedTagId: string,
      renamedTag?: LocalTaskTagCatalogEntry,
    ) => {
      for (const task of Object.values(state.taskById)) {
        const reconciledTask = reconcileTaskTagRefs(task, removedTagId, renamedTag);
        if (reconciledTask !== task) writeTaskEntity(state, reconciledTask);
      }
      state.hubTasks = state.hubTasks.map((task) => reconcileTaskTagRefs(task, removedTagId, renamedTag));
      state.workspaceTasks = state.workspaceTasks.map((task) => reconcileTaskTagRefs(task, removedTagId, renamedTag));
      state.linkCandidateTasks = state.linkCandidateTasks.map((task) =>
        reconcileTaskTagRefs(task, removedTagId, renamedTag),
      );
    };

    return {
      taskById: {},
      hubTasks: [],
      hubProjectDisplayById: {},
      hubFilters: {},
      hubSearchQuery: "",
      progressingTaskCount: 0,
      hubLoadState: "idle",
      hubError: null,
      tagCatalog: [],
      tagSuggestions: [],
      tagSuggestionsLoadState: "idle",
      tagSuggestionsError: null,
      selectedWorkspaceId: null,
      selectedWorkspaceTaskId: null,
      workspaceTasks: [],
      workspaceLinks: [],
      workspaceProgressingTaskCount: 0,
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
      detailsByTaskId: {},
      detailsLoadStateByTaskId: {},
      detailsErrorByTaskId: {},
      taskLinksByTaskId: {},
      taskLinksLoadStateByTaskId: {},
      taskLinksErrorByTaskId: {},
      pendingMutationCount: 0,
      isMutationLoading: false,
      mutationError: null,
      setHubFilters: (hubFilters) => set({ hubFilters }),
      reconcileHubTagFilter: (removedTagId, survivingTagId) => {
        set((state) => {
          if (!state.hubFilters.tagIds?.includes(removedTagId)) return;
          const tagIds = state.hubFilters.tagIds.flatMap((tagId) => {
            if (tagId !== removedTagId) return [tagId];
            return survivingTagId ? [survivingTagId] : [];
          });
          state.hubFilters.tagIds = [...new Set(tagIds)];
        });
      },
      setHubSearchQuery: (hubSearchQuery) => set({ hubSearchQuery }),
      beginTagCatalogLoad: () => {
        const requestId = ++tagSuggestionsRequestGeneration;
        set({ tagSuggestionsLoadState: "loading", tagSuggestionsError: null });
        return requestId;
      },
      setTagCatalog: (requestId, tagCatalog) => {
        if (requestId === tagSuggestionsRequestGeneration) {
          set({
            tagCatalog,
            tagSuggestions: tagCatalog.map((tag) => tag.name),
            tagSuggestionsLoadState: "loaded",
            tagSuggestionsError: null,
          });
        }
      },
      setTagCatalogError: (requestId, tagSuggestionsError) => {
        if (requestId === tagSuggestionsRequestGeneration) {
          set({ tagSuggestionsLoadState: "error", tagSuggestionsError });
        }
      },
      upsertTagCatalogEntry: (entry) => {
        set((state) => {
          const catalogEntryIndex = state.tagCatalog.findIndex((catalogEntry) => catalogEntry.key === entry.key);
          if (catalogEntryIndex === -1) state.tagCatalog.push(entry);
          else state.tagCatalog[catalogEntryIndex] = entry;
          state.tagSuggestions = state.tagCatalog.map((catalogEntry) => catalogEntry.name);
          state.tagSuggestionsLoadState = "loaded";
          state.tagSuggestionsError = null;
        });
      },
      reconcileTagRename: (renamedTag, removedTagId) => {
        set((state) => {
          const replacedTagId = removedTagId ?? renamedTag.id;
          state.tagCatalog = state.tagCatalog.filter((catalogEntry) => catalogEntry.id !== replacedTagId);
          const catalogEntryIndex = state.tagCatalog.findIndex((catalogEntry) => catalogEntry.id === renamedTag.id);
          if (catalogEntryIndex === -1) state.tagCatalog.push(renamedTag);
          else state.tagCatalog[catalogEntryIndex] = renamedTag;
          state.tagSuggestions = state.tagCatalog.map((catalogEntry) => catalogEntry.name);
          state.tagSuggestionsLoadState = "loaded";
          state.tagSuggestionsError = null;
          reconcileCachedTaskTagRefs(state, replacedTagId, renamedTag);
        });
      },
      reconcileTagDeletion: (deletedTagId) => {
        set((state) => {
          state.tagCatalog = state.tagCatalog.filter((catalogEntry) => catalogEntry.id !== deletedTagId);
          state.tagSuggestions = state.tagCatalog.map((catalogEntry) => catalogEntry.name);
          state.tagSuggestionsLoadState = "loaded";
          state.tagSuggestionsError = null;
          reconcileCachedTaskTagRefs(state, deletedTagId);
        });
      },
      beginProgressingTaskCountLoad: () => ++progressingTaskCountRequestGeneration,
      setProgressingTaskCount: (requestId, progressingTaskCount) => {
        if (requestId === progressingTaskCountRequestGeneration) set({ progressingTaskCount });
      },
      beginHubLoad: () => {
        const requestId = ++progressingTaskCountRequestGeneration;
        hubRequestGeneration = requestId;
        set({ hubLoadState: "loading", hubError: null });
        return requestId;
      },
      setHubResults: (requestId, hubTasks, hubProjectDisplayById, progressingTaskCount) => {
        if (requestId !== hubRequestGeneration) return;
        set((state) => {
          state.hubTasks = hubTasks;
          state.hubProjectDisplayById = hubProjectDisplayById;
          if (requestId === progressingTaskCountRequestGeneration) state.progressingTaskCount = progressingTaskCount;
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
            state.workspaceProgressingTaskCount = 0;
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
          workspaceProgressingTaskCount: 0,
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
          state.workspaceProgressingTaskCount = workspaceTasks.filter((task) => task.status === "progressing").length;
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
      beginDetailsLoad: (taskId) => {
        const requestId = (detailsRequestGenerationByTaskId[taskId] ?? 0) + 1;
        detailsRequestGenerationByTaskId[taskId] = requestId;
        set((state) => {
          state.detailsLoadStateByTaskId[taskId] = "loading";
          state.detailsErrorByTaskId[taskId] = null;
        });
        return requestId;
      },
      setDetails: (requestId, taskId, details) => {
        if (requestId !== detailsRequestGenerationByTaskId[taskId]) return;
        set((state) => {
          state.detailsByTaskId[taskId] = details;
          writeTaskEntity(state, details.task);
          state.detailsLoadStateByTaskId[taskId] = "loaded";
          state.detailsErrorByTaskId[taskId] = null;
        });
      },
      setDetailsError: (requestId, taskId, error) => {
        if (requestId !== detailsRequestGenerationByTaskId[taskId]) return;
        set((state) => {
          state.detailsLoadStateByTaskId[taskId] = "error";
          state.detailsErrorByTaskId[taskId] = error;
        });
      },
      invalidateDetailsLoads: (taskIds) => {
        for (const taskId of taskIds) {
          detailsRequestGenerationByTaskId[taskId] = (detailsRequestGenerationByTaskId[taskId] ?? 0) + 1;
        }
        set((state) => {
          for (const taskId of taskIds) {
            delete state.detailsByTaskId[taskId];
            state.detailsLoadStateByTaskId[taskId] = "idle";
            state.detailsErrorByTaskId[taskId] = null;
          }
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
      invalidateTaskEntities: (taskIds) => {
        for (const taskId of taskIds) {
          taskRequestGenerationByTaskId[taskId] = (taskRequestGenerationByTaskId[taskId] ?? 0) + 1;
          taskEntityRevisionByTaskId[taskId] = (taskEntityRevisionByTaskId[taskId] ?? 0) + 1;
        }
        set((state) => {
          for (const taskId of taskIds) {
            delete state.taskById[taskId];
            state.taskLoadStateByTaskId[taskId] = "idle";
            state.taskErrorByTaskId[taskId] = null;
          }
        });
      },
    };
  }),
);
