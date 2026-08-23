/** Local Task lifecycle states accepted by the daemon. */
export type LocalTaskStatus = "active" | "paused" | "completed";
/** Local Task priority values accepted by the daemon. */
export type LocalTaskPriority = "low" | "medium" | "high";
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
};
/** A Local Task metadata search result. */
export type LocalTaskSearchResult = LocalTask & { rank: number };
/** Derived paths for Local Task context documents. */
export type LocalTaskContextDetails = { directory: string; planPath: string; notesPath: string; outcomePath: string };
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
function parseStatus(payload: unknown): LocalTaskStatus {
  if (payload === "active" || payload === "paused" || payload === "completed") return payload;
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
      "rank",
    ]);
    if (typeof record.rank !== "number" || !Number.isFinite(record.rank))
      throw new TypeError("invalid Local Task search payload");
    const { rank: _rank, ...taskPayload } = record;
    return { ...parseLocalTask(taskPayload), rank: record.rank };
  });
}
/** Strictly parses daemon-derived context paths. */
export function parseLocalTaskContextDetails(payload: unknown): LocalTaskContextDetails {
  const record = requireRecord(payload, "Local Task context", ["directory", "planPath", "notesPath", "outcomePath"]);
  if (Object.values(record).some((value) => typeof value !== "string" || value.length === 0))
    throw new TypeError("invalid Local Task context payload");
  return {
    directory: record.directory as string,
    planPath: record.planPath as string,
    notesPath: record.notesPath as string,
    outcomePath: record.outcomePath as string,
  };
}
