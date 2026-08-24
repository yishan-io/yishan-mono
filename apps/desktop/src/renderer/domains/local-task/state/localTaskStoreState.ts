import type {
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskDetails,
  LocalTaskFilters,
  LocalTaskLoadState,
  LocalTaskTagCatalogEntry,
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
  tagCatalog: LocalTaskTagCatalogEntry[];
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
  detailsByTaskId: Record<string, LocalTaskDetails>;
  detailsLoadStateByTaskId: Record<string, LocalTaskLoadState>;
  detailsErrorByTaskId: Record<string, string | null>;
  taskLinksByTaskId: Record<string, LocalTaskWorkspaceLink[]>;
  taskLinksLoadStateByTaskId: Record<string, LocalTaskLoadState>;
  taskLinksErrorByTaskId: Record<string, string | null>;
  pendingMutationCount: number;
  isMutationLoading: boolean;
  mutationError: string | null;
  setHubFilters: (filters: LocalTaskFilters) => void;
  reconcileHubTagFilter: (removedTagId: string, survivingTagId?: string) => void;
  setHubSearchQuery: (query: string) => void;
  beginTagCatalogLoad: () => number;
  setTagCatalog: (requestId: number, catalog: LocalTaskTagCatalogEntry[]) => void;
  setTagCatalogError: (requestId: number, error: string) => void;
  upsertTagCatalogEntry: (entry: LocalTaskTagCatalogEntry) => void;
  reconcileTagRename: (renamedTag: LocalTaskTagCatalogEntry, removedTagId?: string) => void;
  reconcileTagDeletion: (deletedTagId: string) => void;
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
  beginDetailsLoad: (taskId: string) => number;
  setDetails: (requestId: number, taskId: string, details: LocalTaskDetails) => void;
  setDetailsError: (requestId: number, taskId: string, error: string) => void;
  invalidateDetailsLoads: (taskIds: string[]) => void;
  beginTaskLinksLoad: (taskId: string) => number;
  invalidateTaskLinksLoads: (taskIds: string[]) => void;
  setTaskLinks: (requestId: number, taskId: string, links: LocalTaskWorkspaceLink[]) => void;
  setTaskLinksError: (requestId: number, taskId: string, error: string) => void;
  beginMutation: () => void;
  finishMutation: (error?: string) => void;
  upsertTaskEntity: (task: LocalTask) => void;
  invalidateTaskEntities: (taskIds: string[]) => void;
};
