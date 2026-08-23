import { request } from "@renderer/rpc";
import { asRecord, readOptionalNumber } from "@shared/validation/primitiveReaders";
import type {
  CreateLocalTaskInput,
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskFilters,
  LocalTaskPriority,
  LocalTaskSearchResult,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
  LocalTaskTagColor,
  LocalTaskTagCustomColor,
  LocalTaskWorkspaceLink,
  UpdateLocalTaskInput,
} from "../localTaskTypes";

type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;

function isStatus(status: unknown): status is LocalTaskStatus {
  return status === "active" || status === "paused" || status === "completed";
}

function isPriority(priority: unknown): priority is LocalTaskPriority {
  return priority === "low" || priority === "medium" || priority === "high";
}

function requireRecord(payload: unknown, payloadName: string): Record<string, unknown> {
  const record = asRecord(payload);
  if (!record) throw new TypeError(`invalid ${payloadName} payload`);
  return record;
}

function requireString(record: Record<string, unknown>, field: string, payloadName: string): string {
  const fieldValue = record[field];
  if (typeof fieldValue !== "string" || fieldValue.length === 0) {
    throw new TypeError(`invalid ${payloadName} payload`);
  }
  return fieldValue;
}

function requireNullableString(record: Record<string, unknown>, field: string, payloadName: string): string | null {
  const fieldValue = record[field];
  if (fieldValue !== null && typeof fieldValue !== "string") {
    throw new TypeError(`invalid ${payloadName} payload`);
  }
  return fieldValue;
}

function requireStringArray(record: Record<string, unknown>, field: string, payloadName: string): string[] {
  const fieldValue = record[field];
  if (!Array.isArray(fieldValue) || fieldValue.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`invalid ${payloadName} payload`);
  }
  return fieldValue;
}

function isTagColor(color: unknown): color is LocalTaskTagColor {
  return (
    color === "amber" ||
    color === "blue" ||
    color === "green" ||
    color === "purple" ||
    color === "red" ||
    color === "teal"
  );
}

function isCustomTagColor(color: unknown): color is LocalTaskTagCustomColor {
  return typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color);
}

function parseTagCatalogEntry(payload: unknown): LocalTaskTagCatalogEntry {
  const record = requireRecord(payload, "Local Task tag catalog");
  const color = record.color;
  if (color !== null && !isTagColor(color)) throw new TypeError("invalid Local Task tag catalog payload");
  const customColor = record.customColor;
  if (customColor !== null && !isCustomTagColor(customColor))
    throw new TypeError("invalid Local Task tag catalog payload");
  if (color !== null && customColor !== null) throw new TypeError("invalid Local Task tag catalog payload");
  return {
    key: requireString(record, "key", "Local Task tag catalog"),
    name: requireString(record, "name", "Local Task tag catalog"),
    aliases: requireStringArray(record, "aliases", "Local Task tag catalog"),
    color,
    customColor,
  };
}

function parseTagCatalog(payload: unknown): LocalTaskTagCatalogEntry[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task tag catalog payload");
  return payload.map(parseTagCatalogEntry);
}

function parseTask(payload: unknown): LocalTask {
  const record = requireRecord(payload, "Local Task");
  if (!isStatus(record.status) || !isPriority(record.priority) || typeof record.description !== "string") {
    throw new TypeError("invalid Local Task payload");
  }
  return {
    id: requireString(record, "id", "Local Task"),
    projectId: requireNullableString(record, "projectId", "Local Task"),
    title: requireString(record, "title", "Local Task"),
    description: record.description,
    status: record.status,
    priority: record.priority,
    createdAt: requireString(record, "createdAt", "Local Task"),
    updatedAt: requireString(record, "updatedAt", "Local Task"),
    completedAt: requireNullableString(record, "completedAt", "Local Task"),
    tags: requireStringArray(record, "tags", "Local Task"),
  };
}

function parseTaskArray(payload: unknown): LocalTask[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task list payload");
  return payload.map(parseTask);
}

function parseSearchResult(payload: unknown): LocalTaskSearchResult {
  const record = requireRecord(payload, "Local Task search");
  const rank = readOptionalNumber(record.rank);
  if (rank === undefined) throw new TypeError("invalid Local Task search payload");
  return { ...parseTask(payload), rank };
}

function parseLink(payload: unknown): LocalTaskWorkspaceLink {
  const record = requireRecord(payload, "Local Task workspace link");
  if (!isStatus(record.status)) {
    throw new TypeError("invalid Local Task workspace link payload");
  }
  return {
    id: requireString(record, "id", "Local Task workspace link"),
    localTaskId: requireString(record, "localTaskId", "Local Task workspace link"),
    workspaceId: requireString(record, "workspaceId", "Local Task workspace link"),
    status: record.status,
    linkedAt: requireString(record, "linkedAt", "Local Task workspace link"),
    unlinkedAt: requireNullableString(record, "unlinkedAt", "Local Task workspace link"),
  };
}

function parseLinks(payload: unknown): LocalTaskWorkspaceLink[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task workspace link list payload");
  return payload.map(parseLink);
}

function parseContext(payload: unknown): LocalTaskContextDetails {
  const record = requireRecord(payload, "Local Task context");
  return {
    directory: requireString(record, "directory", "Local Task context"),
    planPath: requireString(record, "planPath", "Local Task context"),
    notesPath: requireString(record, "notesPath", "Local Task context"),
    outcomePath: requireString(record, "outcomePath", "Local Task context"),
  };
}

/** Typed adapter for the daemon's complete `localTask.*` RPC namespace. */
export class DaemonLocalTaskClient {
  constructor(private readonly invoke: InvokeFn) {}

  /** Creates one Local Task. */
  async create(input: CreateLocalTaskInput): Promise<LocalTask> {
    return parseTask(await this.invoke("localTask.create", input));
  }

  /** Loads one Local Task by ID. */
  async get(taskId: string): Promise<LocalTask> {
    return parseTask(await this.invoke("localTask.get", { id: taskId }));
  }

  /** Lists Local Tasks matching optional hub or workspace filters. */
  async list(filters: LocalTaskFilters = {}): Promise<LocalTask[]> {
    return parseTaskArray(await this.invoke("localTask.list", filters));
  }

  /** Searches Local Task title and description metadata. */
  async search(query: string, filters: LocalTaskFilters = {}): Promise<LocalTaskSearchResult[]> {
    const payload = await this.invoke("localTask.search", { query, ...filters });
    if (!Array.isArray(payload)) throw new TypeError("invalid Local Task search list payload");
    return payload.map(parseSearchResult);
  }

  /** Lists globally suggested Local Task tags. */
  async listTags(): Promise<string[]> {
    const payload = await this.invoke("localTask.listTags", {});
    if (!Array.isArray(payload) || payload.some((tag) => typeof tag !== "string")) {
      throw new TypeError("invalid Local Task tag list payload");
    }
    return payload;
  }

  /** Lists daemon-owned global Local Task tag catalog entries. */
  async listTagCatalog(): Promise<LocalTaskTagCatalogEntry[]> {
    return parseTagCatalog(await this.invoke("localTask.listTagCatalog", {}));
  }

  /** Sets or clears a daemon-owned global Local Task tag catalog color. */
  async updateTagColor(
    tag: string,
    color: LocalTaskTagColor | null,
    customColor: LocalTaskTagCustomColor | null = null,
  ): Promise<LocalTaskTagCatalogEntry> {
    return parseTagCatalogEntry(await this.invoke("localTask.updateTagColor", { tag, color, customColor }));
  }

  /** Updates mutable Local Task metadata. */
  async update(taskId: string, input: UpdateLocalTaskInput): Promise<LocalTask> {
    return parseTask(await this.invoke("localTask.update", { id: taskId, ...input }));
  }

  /** Loads derived Task Context document paths. */
  async getContext(taskId: string): Promise<LocalTaskContextDetails> {
    return parseContext(await this.invoke("localTask.getContextDetails", { id: taskId }));
  }

  /** Creates one active task-to-workspace relationship. */
  async linkWorkspace(taskId: string, workspaceId: string): Promise<LocalTaskWorkspaceLink> {
    return parseLink(await this.invoke("localTask.linkWorkspace", { taskId, workspaceId }));
  }

  /** Completes one workspace relationship while preserving history. */
  async unlinkWorkspace(linkId: string): Promise<void> {
    await this.invoke("localTask.unlinkWorkspace", { linkId });
  }

  /** Updates one workspace link's lifecycle status. */
  async updateLinkStatus(linkId: string, status: LocalTaskStatus): Promise<LocalTaskWorkspaceLink> {
    return parseLink(await this.invoke("localTask.updateWorkspaceLinkStatus", { linkId, status }));
  }

  /** Lists all historical Local Task links for one workspace. */
  async listWorkspaceLinks(workspaceId: string): Promise<LocalTaskWorkspaceLink[]> {
    return parseLinks(await this.invoke("localTask.listWorkspaceLinks", { workspaceId }));
  }

  /** Lists all historical workspace links for one Local Task. */
  async listTaskLinks(taskId: string): Promise<LocalTaskWorkspaceLink[]> {
    return parseLinks(await this.invoke("localTask.listTaskLinks", { id: taskId }));
  }
}

const localTaskClient = new DaemonLocalTaskClient(request);

/** Creates one Local Task through the daemon. */
export async function createLocalTask(input: CreateLocalTaskInput): Promise<LocalTask> {
  return localTaskClient.create(input);
}
/** Loads one Local Task through the daemon. */
export async function getLocalTask(taskId: string): Promise<LocalTask> {
  return localTaskClient.get(taskId);
}
/** Lists Local Tasks through the daemon. */
export async function listLocalTasks(filters: LocalTaskFilters = {}): Promise<LocalTask[]> {
  return localTaskClient.list(filters);
}
/** Searches Local Task metadata through the daemon. */
export async function searchLocalTasks(
  query: string,
  filters: LocalTaskFilters = {},
): Promise<LocalTaskSearchResult[]> {
  return localTaskClient.search(query, filters);
}
/** Lists globally suggested Local Task tags through the daemon. */
export async function listLocalTaskTags(): Promise<string[]> {
  return localTaskClient.listTags();
}
/** Lists daemon-owned global Local Task tag catalog entries. */
export async function listLocalTaskTagCatalog(): Promise<LocalTaskTagCatalogEntry[]> {
  return localTaskClient.listTagCatalog();
}
/** Sets or clears one daemon-owned Local Task tag catalog color. */
export async function updateLocalTaskTagColor(
  tag: string,
  color: LocalTaskTagColor | null,
  customColor: LocalTaskTagCustomColor | null = null,
): Promise<LocalTaskTagCatalogEntry> {
  return localTaskClient.updateTagColor(tag, color, customColor);
}
/** Updates one Local Task through the daemon. */
export async function updateLocalTask(taskId: string, input: UpdateLocalTaskInput): Promise<LocalTask> {
  return localTaskClient.update(taskId, input);
}
/** Loads Task Context paths through the daemon. */
export async function getLocalTaskContext(taskId: string): Promise<LocalTaskContextDetails> {
  return localTaskClient.getContext(taskId);
}
/** Links one Local Task to one local workspace. */
export async function linkLocalTaskWorkspace(taskId: string, workspaceId: string): Promise<LocalTaskWorkspaceLink> {
  return localTaskClient.linkWorkspace(taskId, workspaceId);
}
/** Unlinks one Local Task workspace relationship. */
export async function unlinkLocalTaskWorkspace(linkId: string): Promise<void> {
  return localTaskClient.unlinkWorkspace(linkId);
}
/** Updates one Local Task workspace link status. */
export async function updateLocalTaskLinkStatus(
  linkId: string,
  status: LocalTaskStatus,
): Promise<LocalTaskWorkspaceLink> {
  return localTaskClient.updateLinkStatus(linkId, status);
}
/** Lists historical Local Task links for one workspace. */
export async function listLocalTaskWorkspaceLinks(workspaceId: string): Promise<LocalTaskWorkspaceLink[]> {
  return localTaskClient.listWorkspaceLinks(workspaceId);
}
/** Lists historical workspace links for one Local Task. */
export async function listLocalTaskLinks(taskId: string): Promise<LocalTaskWorkspaceLink[]> {
  return localTaskClient.listTaskLinks(taskId);
}
