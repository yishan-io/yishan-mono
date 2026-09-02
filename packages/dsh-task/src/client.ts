import { CapabilityClient, type CapabilityIdentity, type CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";

import {
  type LocalTask,
  type TaskAppendNoteInput,
  type TaskAppendNoteResult,
  type TaskCapabilityRequest,
  type TaskFinishInput,
  type TaskFinishResult,
  type TaskListInput,
  type TaskListResult,
  type TaskReadInput,
  type TaskReadResult,
  type TaskSearchInput,
  type TaskSearchResult,
  type TaskTemplatesResult,
  type TaskUpdateInput,
  type TaskWriteInput,
  type TaskWriteResult,
  localTaskSchema,
  taskAppendNoteInputSchema,
  taskAppendNoteResultSchema,
  taskFinishInputSchema,
  taskFinishResultSchema,
  taskListInputSchema,
  taskListResultSchema,
  taskReadInputSchema,
  taskReadResultSchema,
  taskSearchInputSchema,
  taskSearchResultSchema,
  taskStartCapabilityInputSchema,
  taskTemplatesResultSchema,
  taskUpdateInputSchema,
  taskWriteInputSchema,
  taskWriteResultSchema,
} from "./protocol";

export type StartTaskInput = {
  title: string;
  description?: string;
  goal?: string;
  context?: string;
  acceptanceCriteria?: string[];
  priority?: "low" | "medium" | "high";
  tags?: string[];
  workspaceId?: string;
};

/** Sends Local Task operations through the base daemon capability client. */
export class TaskClient {
  private readonly client: CapabilityClient<TaskCapabilityRequest["operation"], TaskCapabilityRequest["input"]>;

  constructor(
    transport: CapabilityTransport<TaskCapabilityRequest>,
    identity: CapabilityIdentity,
    signal: AbortSignal,
  ) {
    this.client = new CapabilityClient(transport, identity, signal, "task");
  }

  async start(input: StartTaskInput): Promise<LocalTask> {
    const { goal: _goal, context: _context, acceptanceCriteria: _criteria, ...metadata } = input;
    const request = taskStartCapabilityInputSchema.parse({
      ...metadata,
      title: requireText(input.title, "Title"),
      description: buildTaskDescription(input),
    });
    return localTaskSchema.parse(await this.client.request("task.start", request));
  }

  async list(input: TaskListInput): Promise<TaskListResult> {
    return taskListResultSchema.parse(await this.client.request("task.list", taskListInputSchema.parse(input)));
  }

  async search(input: TaskSearchInput): Promise<TaskSearchResult> {
    const request = taskSearchInputSchema.parse({ ...input, query: requireText(input.query, "Search query") });
    return taskSearchResultSchema.parse(await this.client.request("task.search", request));
  }

  async read(input: TaskReadInput): Promise<TaskReadResult> {
    return taskReadResultSchema.parse(await this.client.request("task.read", taskReadInputSchema.parse(input)));
  }

  async update(input: TaskUpdateInput): Promise<LocalTask> {
    return localTaskSchema.parse(await this.client.request("task.update", taskUpdateInputSchema.parse(input)));
  }

  async write(input: TaskWriteInput): Promise<TaskWriteResult> {
    return taskWriteResultSchema.parse(await this.client.request("task.write", taskWriteInputSchema.parse(input)));
  }

  async appendNote(input: TaskAppendNoteInput): Promise<TaskAppendNoteResult> {
    return taskAppendNoteResultSchema.parse(
      await this.client.request("task.appendNote", taskAppendNoteInputSchema.parse(input)),
    );
  }

  async finish(input: TaskFinishInput): Promise<TaskFinishResult> {
    return taskFinishResultSchema.parse(await this.client.request("task.finish", taskFinishInputSchema.parse(input)));
  }

  async templateRead(): Promise<TaskTemplatesResult> {
    return taskTemplatesResultSchema.parse(await this.client.request("task.templateRead", {}));
  }
}

/** Builds one task description from either direct or structured input. */
export function buildTaskDescription(
  input: Pick<StartTaskInput, "description" | "goal" | "context" | "acceptanceCriteria">,
): string {
  const description = input.description?.trim();
  const goal = input.goal?.trim();
  const context = input.context?.trim();
  const criteria = input.acceptanceCriteria?.map((criterion) => requireText(criterion, "Acceptance criterion")) ?? [];
  if (
    description !== undefined &&
    (goal !== undefined || context !== undefined || input.acceptanceCriteria !== undefined)
  ) {
    throw new Error("Provide description or goal/context/acceptanceCriteria, not both.");
  }
  if (description !== undefined) return description;
  return [
    ...(goal === undefined ? [] : [`## Goal\n\n${requireText(goal, "Goal")}`]),
    ...(context === undefined ? [] : [`## Context\n\n${requireText(context, "Context")}`]),
    ...(criteria.length === 0 ? [] : [`## Acceptance Criteria\n\n${criteria.map((item) => `- ${item}`).join("\n")}`]),
  ].join("\n\n");
}

function requireText(value: string, name: string): string {
  const text = value.trim();
  if (text.length === 0) throw new Error(`${name} must not be empty.`);
  return text;
}

export type { TaskCapabilityRequest } from "./protocol";
