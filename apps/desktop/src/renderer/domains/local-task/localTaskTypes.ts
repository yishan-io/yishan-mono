/** Local Task lifecycle states supported by the daemon. */
export type LocalTaskStatus = "active" | "paused" | "completed";

/** Local Task priority values supported by the daemon. */
export type LocalTaskPriority = "low" | "medium" | "high";

/** A Local Task's relationship to one local workspace. */
export type LocalTaskLinkRole = "primary" | "related";

/** Authoritative Local Task metadata returned by the local daemon. */
export type LocalTask = {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  status: LocalTaskStatus;
  priority: LocalTaskPriority;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

/** A Local Task metadata search result with its FTS rank. */
export type LocalTaskSearchResult = LocalTask & {
  rank: number;
};

/** Derived filesystem locations for one Local Task's context documents. */
export type LocalTaskContextDetails = {
  directory: string;
  planPath: string;
  notesPath: string;
  outcomePath: string;
};

/** One historical relationship between a Local Task and a local workspace. */
export type LocalTaskWorkspaceLink = {
  id: string;
  localTaskId: string;
  workspaceId: string;
  role: LocalTaskLinkRole;
  status: LocalTaskStatus;
  linkedAt: string;
  unlinkedAt: string | null;
};

/** Optional filters accepted by Local Task list and metadata search calls. */
export type LocalTaskFilters = {
  projectId?: string;
  status?: LocalTaskStatus;
  priority?: LocalTaskPriority;
  workspaceId?: string;
};

/** Metadata accepted when creating a Local Task. */
export type CreateLocalTaskInput = {
  projectId?: string;
  title: string;
  description?: string;
  priority?: LocalTaskPriority;
};

/** Mutable Local Task metadata accepted by the update RPC. */
export type UpdateLocalTaskInput = {
  title?: string;
  description?: string;
  status?: LocalTaskStatus;
  priority?: LocalTaskPriority;
};

/** Loading state shared by Local Task data projections. */
export type LocalTaskLoadState = "idle" | "loading" | "loaded" | "error";
