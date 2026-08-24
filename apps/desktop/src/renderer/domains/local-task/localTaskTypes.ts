/** Local Task lifecycle states supported by the daemon. */
export type LocalTaskStatus = "active" | "paused" | "completed";

/** Local Task priority values supported by the daemon. */
export type LocalTaskPriority = "low" | "medium" | "high";

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
  tags: string[];
  tagRefs: LocalTaskTagRef[];
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

/** Daemon-resolved project display metadata for a Local Task detail view. */
export type LocalTaskProjectDisplay = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

/**
 * Workspace kind emitted by `localTask.getDetails`: managed daemon worktrees,
 * local primary checkouts, and non-git folders.
 */
export type LocalTaskWorkspaceDisplayKind = "managed" | "local" | "folder";

/** Persisted workspace lifecycle status emitted by `localTask.getDetails`. */
export type LocalTaskWorkspaceDisplayStatus = "provisioning" | "active" | "closing" | "closed";

/** Daemon-resolved workspace display metadata for a Local Task detail view. */
export type LocalTaskWorkspaceDisplay = {
  id: string;
  projectId: string;
  name: string;
  kind: LocalTaskWorkspaceDisplayKind;
  status: LocalTaskWorkspaceDisplayStatus;
};

/** Detail projection containing a task and daemon-resolved display relationships. */
export type LocalTaskDetails = {
  task: LocalTask;
  project: LocalTaskProjectDisplay | null;
  workspaces: LocalTaskWorkspaceDisplay[];
};

/** One historical relationship between a Local Task and a local workspace. */
export type LocalTaskWorkspaceLink = {
  id: string;
  localTaskId: string;
  workspaceId: string;
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
  tags?: string[];
  tagIds?: string[];
};

/** One stable catalog tag reference assigned to a Local Task. */
export type LocalTaskTagRef = {
  id: string;
  name?: string;
};

/** Result returned when a catalog tag rename merges its source into another tag. */
export type LocalTaskTagRenameResult = {
  tag: LocalTaskTagCatalogEntry;
  removedTagId?: string;
};

/** Metadata accepted when creating a Local Task. */
export type CreateLocalTaskInput = {
  projectId?: string;
  title: string;
  description?: string;
  priority?: LocalTaskPriority;
  tags?: string[];
  tagIds?: string[];
};

/** Mutable Local Task metadata accepted by the update RPC. */
export type UpdateLocalTaskInput = {
  title?: string;
  description?: string;
  status?: LocalTaskStatus;
  priority?: LocalTaskPriority;
  tags?: string[];
  tagIds?: string[];
};

/** Loading state shared by Local Task data projections. */
export type LocalTaskLoadState = "idle" | "loading" | "loaded" | "error";

/** One daemon-owned global Local Task tag catalog entry. */
export type LocalTaskTagCatalogEntry = {
  id: string;
  key: string;
  name: string;
  aliases: string[];
  /** Canonical tag color as uppercase #RRGGBB hex, or null when unset. */
  color: string | null;
};
