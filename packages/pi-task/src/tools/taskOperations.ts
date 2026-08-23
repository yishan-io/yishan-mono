import type {
  CreateLocalTaskInput,
  LocalTask,
  LocalTaskFilters,
  LocalTaskSearchResult,
  UpdateLocalTaskInput,
} from "../backend/localTaskTypes";

/** Cancellation options for Local Task metadata operations. */
export type LocalTaskOperationOptions = { signal?: AbortSignal };
/** The Local Task RPC methods used by metadata operations. */
export type LocalTaskMetadataClient = {
  create(input: CreateLocalTaskInput, options?: LocalTaskOperationOptions): Promise<LocalTask>;
  get(id: string, options?: LocalTaskOperationOptions): Promise<LocalTask>;
  list(filters?: LocalTaskFilters, options?: LocalTaskOperationOptions): Promise<LocalTask[]>;
  search(
    query: string,
    filters?: LocalTaskFilters,
    options?: LocalTaskOperationOptions,
  ): Promise<LocalTaskSearchResult[]>;
  update(id: string, input: UpdateLocalTaskInput, options?: LocalTaskOperationOptions): Promise<LocalTask>;
};

/** Input accepted when starting a Local Task. */
export type StartTaskInput = {
  title: string;
  description?: string;
  goal?: string;
  acceptanceCriteria?: string[];
  priority?: CreateLocalTaskInput["priority"];
  tags?: string[];
};
/** Optional Local Task list filters that do not control project scope. */
export type TaskListInput = Omit<LocalTaskFilters, "projectId">;
/** Input accepted when searching Local Task metadata. */
export type SearchTasksInput = TaskListInput & { query: string };
/** Metadata fields mutable through pi-task. Completion is owned by task_finish. */
export type UpdateTaskInput = Omit<UpdateLocalTaskInput, "status"> & { status?: "active" | "paused" };

const MAX_TAGS_PER_TASK = 12;
const MAX_TAG_CODE_POINTS = 32;

/** Performs scoped Local Task metadata operations without touching legacy task files. */
export class LocalTaskOperations {
  constructor(
    private readonly client: LocalTaskMetadataClient,
    private readonly projectId: string | undefined = getProjectIdFromEnvironment(),
  ) {}

  /** Creates an active Local Task in the configured project, or globally when none is configured. */
  async start(input: StartTaskInput, options: LocalTaskOperationOptions = {}): Promise<LocalTask> {
    assertRuntimeTags(input.tags);
    const createInput = {
      title: requireText(input.title, "Title"),
      description: buildDescription(input),
      priority: input.priority,
      tags: input.tags,
      ...(this.projectId === undefined ? {} : { projectId: this.projectId }),
    };
    const task =
      options.signal === undefined
        ? await this.client.create(createInput)
        : await this.client.create(createInput, options);
    return this.assertInScope(task);
  }

  /** Lists metadata tasks within the configured project or the global-only scope. */
  async list(input: TaskListInput = {}, options: LocalTaskOperationOptions = {}): Promise<LocalTask[]> {
    assertRuntimeTags(input.tags);
    const filters = this.buildFilters(input);
    const tasks =
      options.signal === undefined ? await this.client.list(filters) : await this.client.list(filters, options);
    return tasks.filter((task) => this.isInScope(task));
  }

  /** Searches metadata tasks within the configured project or the global-only scope. */
  async search(
    { query, ...filters }: SearchTasksInput,
    options: LocalTaskOperationOptions = {},
  ): Promise<LocalTaskSearchResult[]> {
    assertRuntimeTags(filters.tags);
    const searchQuery = requireText(query, "Search query");
    const searchFilters = this.buildFilters(filters);
    const results =
      options.signal === undefined
        ? await this.client.search(searchQuery, searchFilters)
        : await this.client.search(searchQuery, searchFilters, options);
    return results.filter((task) => this.isInScope(task));
  }

  /** Gets one opaque Local Task ID after enforcing configured project/global scope. */
  async get(id: string, options: LocalTaskOperationOptions = {}): Promise<LocalTask> {
    const taskId = requireTaskId(id);
    return this.assertInScope(
      options.signal === undefined ? await this.client.get(taskId) : await this.client.get(taskId, options),
    );
  }

  /** Updates mutable metadata after checking the opaque task ID belongs to the configured scope. */
  async update(id: string, input: UpdateTaskInput, options: LocalTaskOperationOptions = {}): Promise<LocalTask> {
    assertRuntimeUpdateStatus(input.status);
    assertRuntimeTags(input.tags);
    const taskId = requireTaskId(id);
    await this.get(taskId, options);
    const task =
      options.signal === undefined
        ? await this.client.update(taskId, input)
        : await this.client.update(taskId, input, options);
    return this.assertInScope(task);
  }

  /** Formats the daemon metadata as the read-only synthetic task brief. */
  formatBrief(task: LocalTask): string {
    this.assertInScope(task);
    const tags = task.tags.length === 0 ? "none" : task.tags.join(", ");
    return [
      `# ${task.title}`,
      "",
      `**ID:** ${task.id}`,
      `**Project:** ${task.projectId ?? "global"}`,
      `**Created:** ${task.createdAt}`,
      `**Updated:** ${task.updatedAt}`,
      `**Status:** ${task.status}`,
      `**Priority:** ${task.priority}`,
      `**Tags:** ${tags}`,
      "",
      "## Description",
      "",
      task.description || "No description provided.",
      "",
    ].join("\n");
  }

  private buildFilters(input: TaskListInput): LocalTaskFilters {
    return { ...input, ...(this.projectId === undefined ? {} : { projectId: this.projectId }) };
  }

  private assertInScope(task: LocalTask): LocalTask {
    if (!this.isInScope(task)) throw new Error("Task does not belong to the configured project scope.");
    return task;
  }

  private isInScope(task: LocalTask): boolean {
    return task.projectId === (this.projectId ?? null);
  }
}

/** Creates Local Task operations scoped by YISHAN_PROJECT_ID when it is non-empty. */
export function createLocalTaskOperations(client: LocalTaskMetadataClient, projectId?: string): LocalTaskOperations {
  return new LocalTaskOperations(client, projectId);
}

/** Builds the daemon description from exactly one supported task-brief input style. */
export function buildDescription(input: Pick<StartTaskInput, "description" | "goal" | "acceptanceCriteria">): string {
  const description = input.description?.trim();
  const goal = input.goal?.trim();
  const criteria = input.acceptanceCriteria?.map((criterion) => requireText(criterion, "Acceptance criterion")) ?? [];
  if (description !== undefined && (goal !== undefined || input.acceptanceCriteria !== undefined)) {
    throw new Error("Provide description or goal/acceptanceCriteria, not both.");
  }
  if (description !== undefined) return description;
  if (goal === undefined && criteria.length === 0) return "";
  return [
    ...(goal === undefined ? [] : [goal]),
    ...(criteria.length === 0
      ? []
      : [`## Acceptance Criteria\n\n${criteria.map((criterion) => `- ${criterion}`).join("\n")}`]),
  ].join("\n\n");
}

/** Reads the non-empty configured project ID without treating an empty value as a scope. */
export function getProjectIdFromEnvironment(): string | undefined {
  const projectId = process.env.YISHAN_PROJECT_ID?.trim();
  return projectId || undefined;
}

function assertRuntimeUpdateStatus(status: UpdateTaskInput["status"]): void {
  if (status !== undefined && status !== "active" && status !== "paused") {
    throw new Error("Task status must be active or paused.");
  }
}

function requireTaskId(id: string): string {
  if (typeof id !== "string" || id.length === 0) throw new Error("Task ID must not be empty.");
  return id;
}

function requireText(value: string, name: string): string {
  const text = value.trim();
  if (text.length === 0) throw new Error(`${name} must not be empty.`);
  return text;
}

function assertRuntimeTags(tags: string[] | undefined): void {
  if (tags === undefined) return;
  if (tags.length > MAX_TAGS_PER_TASK) throw new Error(`A task can have at most ${MAX_TAGS_PER_TASK} tags.`);
  for (const tag of tags) {
    const normalizedTag = tag.trim().normalize("NFC");
    if (normalizedTag.length === 0 || Array.from(normalizedTag).length > MAX_TAG_CODE_POINTS)
      throw new Error(`Each tag must contain 1 to ${MAX_TAG_CODE_POINTS} Unicode code points.`);
  }
}
