import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";

/** Local Task lifecycle states accepted by the daemon. */
export type LocalTaskStatus = "new" | "progressing" | "done" | "cancelled";
/** Local Task priority values accepted by the daemon. */
export type LocalTaskPriority = "low" | "medium" | "high";
/** One personal Markdown task description template. */
export type LocalTaskTemplate = { id: string; name: string; content: string };
/** Current personal task templates and agent default. */
export type LocalTaskTemplatesResult = { templates: LocalTaskTemplate[]; agentDefaultId: string };
/** A catalog tag assigned to a Local Task. */
export type LocalTaskTagRef = { id: string; name?: string };
/** Authoritative Local Task metadata returned by the daemon. */
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
/** A Local Task metadata search result. */
export type LocalTaskSearchResult = LocalTask & { rank: number };
/** An association between a Local Task and a local workspace. */
export type LocalTaskWorkspaceLink = {
  id: string;
  localTaskId: string;
  workspaceId: string;
  status: LocalTaskStatus;
  linkedAt: string;
  unlinkedAt: string | null;
};
/** A Local Task context file advertised by the daemon when it exists. */
export type LocalTaskContextFile = { name: "plan.md" | "notes.md" | "outcome.md"; path: string };
/** Daemon-owned Local Task context location and its currently existing files. */
export type LocalTaskContextDetails = { directory: string; files: LocalTaskContextFile[] };
/** Filters supported by list and search RPCs. */
export type LocalTaskFilters = {
  projectId?: string;
  status?: LocalTaskStatus;
  priority?: LocalTaskPriority;
  workspaceId?: string;
  tags?: string[];
};
/** Metadata accepted by localTask.create. */
export type CreateLocalTaskInput = {
  projectId?: string;
  title: string;
  description?: string;
  priority?: LocalTaskPriority;
  tags?: string[];
};
/** Metadata accepted by localTask.update. */
export type UpdateLocalTaskInput = {
  title?: string;
  description?: string;
  status?: LocalTaskStatus;
  priority?: LocalTaskPriority;
  tags?: string[];
};

type WireRecord = Record<string, unknown>;
function hasExactKeys(record: WireRecord, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(record);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}
function requireRecord(payload: unknown, name: string, keys: readonly string[]): WireRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    throw new TypeError(`invalid ${name} payload`);
  const record = payload as WireRecord;
  if (!hasExactKeys(record, keys)) throw new TypeError(`invalid ${name} payload`);
  return record;
}
/** Parses an opaque daemon or imported task ID without imposing an ID format. */
export function parseLocalTaskID(payload: unknown): string {
  if (typeof payload !== "string" || payload.length === 0) throw new TypeError("invalid Local Task ID");
  return payload;
}
function parseNullableString(payload: unknown, name: string): string | null {
  if (payload === null) return null;
  if (typeof payload !== "string") throw new TypeError(`invalid ${name} payload`);
  return payload;
}
function parseStringArray(payload: unknown, name: string): string[] {
  if (!Array.isArray(payload) || payload.some((entry) => typeof entry !== "string"))
    throw new TypeError(`invalid ${name} payload`);
  return payload;
}
function parseLocalTaskTagRefs(payload: unknown): LocalTaskTagRef[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task payload");
  return payload.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      throw new TypeError("invalid Local Task payload");
    const tagRef = entry as WireRecord;
    const hasName = "name" in tagRef;
    if (!hasExactKeys(tagRef, hasName ? ["id", "name"] : ["id"]) || typeof tagRef.id !== "string")
      throw new TypeError("invalid Local Task payload");
    if (!hasName) return { id: tagRef.id };
    if (typeof tagRef.name !== "string") throw new TypeError("invalid Local Task payload");
    return { id: tagRef.id, name: tagRef.name };
  });
}
function parseStatus(payload: unknown): LocalTaskStatus {
  if (payload === "new" || payload === "progressing" || payload === "done" || payload === "cancelled") return payload;
  throw new TypeError("invalid Local Task payload");
}
function parsePriority(payload: unknown): LocalTaskPriority {
  if (payload === "low" || payload === "medium" || payload === "high") return payload;
  throw new TypeError("invalid Local Task payload");
}
/** Strictly parses a daemon Local Task result. */
export function parseLocalTask(payload: unknown): LocalTask {
  const record = requireRecord(payload, "Local Task", [
    "id",
    "projectId",
    "title",
    "description",
    "status",
    "priority",
    "createdAt",
    "updatedAt",
    "completedAt",
    "tags",
    "tagRefs",
  ]);
  if (
    typeof record.title !== "string" ||
    typeof record.description !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  )
    throw new TypeError("invalid Local Task payload");
  return {
    id: parseLocalTaskID(record.id),
    projectId: parseNullableString(record.projectId, "Local Task"),
    title: record.title,
    description: record.description,
    status: parseStatus(record.status),
    priority: parsePriority(record.priority),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: parseNullableString(record.completedAt, "Local Task"),
    tags: parseStringArray(record.tags, "Local Task"),
    tagRefs: parseLocalTaskTagRefs(record.tagRefs),
  };
}
/** Strictly parses current personal task templates and the agent default. */
export function parseLocalTaskTemplates(payload: unknown): LocalTaskTemplatesResult {
  const templatesPayload = requireRecord(payload, "Local Task templates", ["templates", "agentDefaultId"]);
  if (typeof templatesPayload.agentDefaultId !== "string" || !Array.isArray(templatesPayload.templates))
    throw new TypeError("invalid Local Task templates payload");
  const templates = templatesPayload.templates.map((entry): LocalTaskTemplate => {
    const template = requireRecord(entry, "Local Task templates", ["id", "name", "content"]);
    if (typeof template.id !== "string" || typeof template.name !== "string" || typeof template.content !== "string")
      throw new TypeError("invalid Local Task templates payload");
    return { id: template.id, name: template.name, content: template.content };
  });
  return { templates, agentDefaultId: templatesPayload.agentDefaultId };
}

/** Strictly parses a daemon Local Task workspace link. */
export function parseLocalTaskWorkspaceLink(payload: unknown): LocalTaskWorkspaceLink {
  const record = requireRecord(payload, "Local Task workspace link", [
    "id",
    "localTaskId",
    "workspaceId",
    "status",
    "linkedAt",
    "unlinkedAt",
  ]);
  if (typeof record.linkedAt !== "string") throw new TypeError("invalid Local Task workspace link payload");
  return {
    id: parseLocalTaskID(record.id),
    localTaskId: parseLocalTaskID(record.localTaskId),
    workspaceId: parseLocalTaskID(record.workspaceId),
    status: parseStatus(record.status),
    linkedAt: record.linkedAt,
    unlinkedAt: parseNullableString(record.unlinkedAt, "Local Task workspace link"),
  };
}

/** Strictly parses a daemon Local Task list. */
export function parseLocalTaskList(payload: unknown): LocalTask[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task list payload");
  return payload.map(parseLocalTask);
}
/** Strictly parses a daemon Local Task search result list. */
export function parseLocalTaskSearchResults(payload: unknown): LocalTaskSearchResult[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task search payload");
  return payload.map((entry) => {
    const record = requireRecord(entry, "Local Task search", [
      "id",
      "projectId",
      "title",
      "description",
      "status",
      "priority",
      "createdAt",
      "updatedAt",
      "completedAt",
      "tags",
      "tagRefs",
      "rank",
    ]);
    if (typeof record.rank !== "number" || !Number.isFinite(record.rank))
      throw new TypeError("invalid Local Task search payload");
    const { rank: _rank, ...taskPayload } = record;
    return { ...parseLocalTask(taskPayload), rank: record.rank };
  });
}
const CONTEXT_FILE_NAMES = ["plan.md", "notes.md", "outcome.md"] as const;

/** Strictly parses daemon-derived context locations and existing context files. */
export function parseLocalTaskContextDetails(payload: unknown): LocalTaskContextDetails {
  const record = requireRecord(payload, "Local Task context", ["directory", "files"]);
  if (typeof record.directory !== "string" || record.directory.length === 0 || !Array.isArray(record.files))
    throw new TypeError("invalid Local Task context payload");

  const directory = record.directory;
  const files = record.files.map((entry): LocalTaskContextFile => {
    const file = requireRecord(entry, "Local Task context", ["name", "path"]);
    if (
      !CONTEXT_FILE_NAMES.includes(file.name as LocalTaskContextFile["name"]) ||
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      !isDirectContextFilePath(directory, file.path, file.name)
    )
      throw new TypeError("invalid Local Task context payload");
    return { name: file.name as LocalTaskContextFile["name"], path: file.path };
  });

  return { directory, files };
}

function isDirectContextFilePath(directory: string, path: string, name: unknown): boolean {
  return (
    typeof name === "string" &&
    isAbsolute(directory) &&
    isAbsolute(path) &&
    normalize(directory) === directory &&
    normalize(path) === path &&
    dirname(path) === directory &&
    basename(path) === name &&
    resolve(path) === join(directory, name)
  );
}
