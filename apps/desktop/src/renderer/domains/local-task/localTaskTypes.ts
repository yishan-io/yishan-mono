/** Local Task lifecycle states supported by the daemon. */
export type LocalTaskStatus = "new" | "progressing" | "done" | "cancelled";

/** Local Task priority values supported by the daemon. */
export type LocalTaskPriority = "low" | "medium" | "high";

/** A personal Markdown template available when creating a Local Task. */
export type LocalTaskTemplate = {
  id: string;
  name: string;
  content: string;
};

/** The full task template collection and the template the Pi agent uses by default. */
export type LocalTaskTemplatesResult = {
  templates: LocalTaskTemplate[];
  agentDefaultId: string;
};

/** The full template collection and agent default accepted by the daemon. */
export type LocalTaskSetTemplatesInput = {
  templates: LocalTaskTemplate[];
  agentDefaultId: string;
};

/** Authoritative Local Task metadata returned by the local daemon. */
export type LocalTask = {
  id: string;
  /** Daemon-assigned human-readable task key, or null while legacy data is backfilled. */
  key: string | null;
  projectId: string | null;
  /** Folder classification persisted by the daemon; absent for real projects and legacy tasks. */
  projectKind?: "folder";
  /** Folder name persisted with a folder task so it survives workspace removal. */
  projectName?: string;
  title: string;
  description: string;
  status: LocalTaskStatus;
  priority: LocalTaskPriority;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  hasActiveWorkspace: boolean;
  tags: string[];
  tagRefs: LocalTaskTagRef[];
};

/** A Local Task metadata search result with its FTS rank. */
export type LocalTaskSearchResult = LocalTask & {
  rank: number;
};

/** Task Hub list response with daemon-resolved project display metadata. */
export type LocalTaskListProjection = {
  tasks: LocalTask[];
  projectsById: Record<string, LocalTaskProjectDisplay>;
  total: number;
};

/** Names of the v1 documents supported in a Local Task context. */
export type LocalTaskContextFileName = "plan.md" | "notes.md" | "outcome.md";

/** One existing filesystem document in a Local Task's context. */
export type LocalTaskContextFile = {
  name: LocalTaskContextFileName;
  path: string;
};

/** Derived filesystem locations and existing documents for one Local Task's context. */
export type LocalTaskContextDetails = {
  directory: string;
  files: LocalTaskContextFile[];
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
  status?: LocalTaskStatus[];
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
  /** Stable UUID retained when retrying the same create request. */
  id?: string;
  projectId?: string;
  projectKind?: "folder";
  projectName?: string;
  organizationId?: string;
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
