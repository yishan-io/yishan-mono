import { request } from "@renderer/rpc";
import { asRecord, readOptionalNumber } from "@shared/validation/primitiveReaders";
import type {
  CreateLocalTaskInput,
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskContextFile,
  LocalTaskContextFileName,
  LocalTaskDetails,
  LocalTaskFilters,
  LocalTaskListProjection,
  LocalTaskPriority,
  LocalTaskProjectDisplay,
  LocalTaskSearchResult,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
  LocalTaskTagRenameResult,
  LocalTaskWorkspaceDisplay,
  LocalTaskWorkspaceDisplayStatus,
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

function parseTagRef(payload: unknown): { id: string; name?: string } {
  const record = requireRecord(payload, "Local Task tag reference");
  const name = record.name;
  if (name !== undefined && typeof name !== "string") {
    throw new TypeError("invalid Local Task tag reference payload");
  }
  return { id: requireString(record, "id", "Local Task tag reference"), ...(name === undefined ? {} : { name }) };
}

function parseTagRefs(payload: unknown): { id: string; name?: string }[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task tag references payload");
  return payload.map(parseTagRef);
}

/** Returns true when value is a valid canonical uppercase #RRGGBB hex string. */
function isCanonicalHexColor(color: unknown): color is string {
  return typeof color === "string" && /^#[0-9A-F]{6}$/.test(color);
}

function parseTagCatalogEntry(payload: unknown): LocalTaskTagCatalogEntry {
  const record = requireRecord(payload, "Local Task tag catalog");
  const color = record.color;
  if (color !== null && !isCanonicalHexColor(color)) throw new TypeError("invalid Local Task tag catalog payload");
  return {
    id: requireString(record, "id", "Local Task tag catalog"),
    key: requireString(record, "key", "Local Task tag catalog"),
    name: requireString(record, "name", "Local Task tag catalog"),
    aliases: requireStringArray(record, "aliases", "Local Task tag catalog"),
    color: color as string | null,
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
    tagRefs: parseTagRefs(record.tagRefs),
  };
}

function parseTaskArray(payload: unknown): LocalTask[] {
  if (!Array.isArray(payload)) throw new TypeError("invalid Local Task list payload");
  return payload.map(parseTask);
}

function parseListProjection(payload: unknown): LocalTaskListProjection {
  if (Array.isArray(payload)) throw new TypeError("invalid Local Task list projection payload");
  const record = requireRecord(payload, "Local Task list projection");
  const total = record.total;
  const projectsById = asRecord(record.projectsById);
  if (
    !Array.isArray(record.tasks) ||
    !projectsById ||
    Array.isArray(projectsById) ||
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total < 0
  ) {
    throw new TypeError("invalid Local Task list projection payload");
  }
  try {
    return {
      tasks: record.tasks.map(parseTask),
      projectsById: Object.fromEntries(
        Object.entries(projectsById).map(([projectId, project]) => {
          const parsedProject = parseProjectDisplay(project);
          if (parsedProject.id !== projectId) throw new TypeError("invalid Local Task list projection payload");
          return [projectId, parsedProject];
        }),
      ),
      total,
    };
  } catch {
    throw new TypeError("invalid Local Task list projection payload");
  }
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

function parseProjectDisplay(payload: unknown): LocalTaskProjectDisplay {
  const record = requireRecord(payload, "Local Task project display");
  return {
    id: requireString(record, "id", "Local Task project display"),
    name: requireString(record, "name", "Local Task project display"),
    icon: requireString(record, "icon", "Local Task project display"),
    color: requireString(record, "color", "Local Task project display"),
  };
}

function parseWorkspaceDisplay(payload: unknown): LocalTaskWorkspaceDisplay {
  const record = requireRecord(payload, "Local Task workspace display");
  const kind = record.kind;
  const status = record.status;
  if (
    (kind !== "managed" && kind !== "local" && kind !== "folder") ||
    (status !== "provisioning" && status !== "active" && status !== "closing" && status !== "closed")
  ) {
    throw new TypeError("invalid Local Task details payload");
  }
  return {
    id: requireString(record, "id", "Local Task workspace display"),
    projectId: requireString(record, "projectId", "Local Task workspace display"),
    name: requireString(record, "name", "Local Task workspace display"),
    kind,
    status: status as LocalTaskWorkspaceDisplayStatus,
  };
}

function parseDetails(payload: unknown): LocalTaskDetails {
  const record = requireRecord(payload, "Local Task details");
  if (!Array.isArray(record.workspaces)) throw new TypeError("invalid Local Task details payload");
  if (record.project !== null && asRecord(record.project) === null) {
    throw new TypeError("invalid Local Task details payload");
  }
  try {
    return {
      task: parseTask(record.task),
      project: record.project === null ? null : parseProjectDisplay(record.project),
      workspaces: record.workspaces.map(parseWorkspaceDisplay),
    };
  } catch {
    throw new TypeError("invalid Local Task details payload");
  }
}

function parseContextFile(payload: unknown): LocalTaskContextFile {
  const record = requireRecord(payload, "Local Task context file");
  const name = requireString(record, "name", "Local Task context file");
  if (name !== "plan.md" && name !== "notes.md" && name !== "outcome.md") {
    throw new TypeError("invalid Local Task context file payload");
  }
  return { name: name as LocalTaskContextFileName, path: requireString(record, "path", "Local Task context file") };
}

function parseContext(payload: unknown): LocalTaskContextDetails {
  const record = requireRecord(payload, "Local Task context");
  if (!Array.isArray(record.files)) throw new TypeError("invalid Local Task context payload");
  return {
    directory: requireString(record, "directory", "Local Task context"),
    files: record.files.map(parseContextFile),
  };
}

function mapTagIDsToRefs<Input extends { tagIds?: string[] }>(
  input: Input,
): Omit<Input, "tagIds"> & { tagRefs?: { id: string }[] } {
  const { tagIds, ...legacyInput } = input;
  if (tagIds === undefined) return legacyInput;
  return { ...legacyInput, tagRefs: tagIds.map((id) => ({ id })) };
}

/** Typed adapter for the daemon's complete `localTask.*` RPC namespace. */
export class DaemonLocalTaskClient {
  constructor(private readonly invoke: InvokeFn) {}

  /** Creates one Local Task. */
  async create(input: CreateLocalTaskInput): Promise<LocalTask> {
    return parseTask(await this.invoke("localTask.create", mapTagIDsToRefs(input)));
  }

  /** Loads one Local Task by ID. */
  async get(taskId: string): Promise<LocalTask> {
    return parseTask(await this.invoke("localTask.get", { id: taskId }));
  }

  /** Loads a Local Task with daemon-resolved project and workspace display metadata. */
  async getDetails(taskId: string): Promise<LocalTaskDetails> {
    return parseDetails(await this.invoke("localTask.getDetails", { id: taskId }));
  }

  /** Lists Local Tasks matching optional hub or workspace filters. */
  async list(filters: LocalTaskFilters = {}): Promise<LocalTask[]> {
    return parseTaskArray(await this.invoke("localTask.list", filters));
  }

  /** Lists Task Hub rows with daemon-resolved project display metadata. */
  async listProjection(filters: LocalTaskFilters = {}, query = ""): Promise<LocalTaskListProjection> {
    return parseListProjection(
      await this.invoke("localTask.listProjection", { ...filters, ...(query ? { query } : {}) }),
    );
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
  async updateTagColor(id: string, color: string | null): Promise<LocalTaskTagCatalogEntry> {
    return parseTagCatalogEntry(await this.invoke("localTask.updateTagColor", { id, color }));
  }

  /** Creates one daemon-owned Local Task catalog tag. */
  async createTag(name: string): Promise<LocalTaskTagCatalogEntry> {
    return parseTagCatalogEntry(await this.invoke("localTask.createTag", { name }));
  }

  /** Renames one daemon-owned Local Task catalog tag by stable ID. */
  async renameTag(id: string, name: string): Promise<LocalTaskTagRenameResult> {
    const payload = requireRecord(await this.invoke("localTask.renameTag", { id, name }), "Local Task tag rename");
    const removedTagId = payload.removedTagId;
    if (removedTagId !== undefined && typeof removedTagId !== "string") {
      throw new TypeError("invalid Local Task tag rename payload");
    }
    return { tag: parseTagCatalogEntry(payload.tag), ...(removedTagId === undefined ? {} : { removedTagId }) };
  }

  /** Deletes one daemon-owned Local Task catalog tag by stable ID. */
  async deleteTag(id: string): Promise<void> {
    await this.invoke("localTask.deleteTag", { id });
  }

  /** Updates mutable Local Task metadata. */
  async update(taskId: string, input: UpdateLocalTaskInput): Promise<LocalTask> {
    return parseTask(await this.invoke("localTask.update", { id: taskId, ...mapTagIDsToRefs(input) }));
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

export const localTaskClient = new DaemonLocalTaskClient(request);
