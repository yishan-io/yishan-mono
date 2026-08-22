import { StringEnum } from "@earendil-works/pi-ai";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type ExtensionAPI, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { LocalTaskRpcClient } from "../backend/localTaskRpcClient";
import { type LocalTaskDocumentBackend, createLocalTaskDocuments } from "./taskDocuments";
import { type LocalTaskMetadataClient, createLocalTaskOperations } from "./taskOperations";

const taskIdSchema = Type.String({ minLength: 1 });
const contentSchema = Type.String({ minLength: 1, maxLength: 50_000 });
const titleSchema = Type.String({ minLength: 1, maxLength: 200 });
const descriptionSchema = Type.String({ minLength: 1, maxLength: 10_000 });
const updateDescriptionSchema = Type.String({ minLength: 0, maxLength: 10_000 });
// JSON Schema string lengths use UTF-16 code units; 64 admits any 32-code-point tag.
const tagSchema = Type.String({ minLength: 1, maxLength: 64 });
const tagsSchema = Type.Array(tagSchema, { maxItems: 12 });
const prioritySchema = StringEnum(["low", "medium", "high"] as const);
const listStatusSchema = StringEnum(["active", "paused", "completed"] as const);
const updateStatusSchema = StringEnum(["active", "paused"] as const);
const readDocumentSchema = StringEnum(["task", "notes", "plan", "outcome"] as const);
const writeDocumentSchema = StringEnum(["notes", "plan", "outcome"] as const);

/** The complete daemon surface needed by the eight Pi task tools. */
export type LocalTaskToolBackend = LocalTaskMetadataClient & LocalTaskDocumentBackend;
type BackendResolver = () => LocalTaskToolBackend;
/** Registers the eight daemon-backed Local Task tools for a Pi session. */
export function registerTaskTools(pi: ExtensionAPI, backend?: LocalTaskToolBackend): void {
  const getBackend = createBackendResolver(backend);

  pi.registerTool({
    name: "task_start",
    label: "Start Task",
    description: "Create a Local Task in the current project scope.",
    parameters: Type.Object(
      {
        title: titleSchema,
        description: Type.Optional(descriptionSchema),
        goal: Type.Optional(descriptionSchema),
        acceptanceCriteria: Type.Optional(
          Type.Array(Type.String({ minLength: 1, maxLength: 2_000 }), { maxItems: 50 }),
        ),
        priority: Type.Optional(prioritySchema),
        tags: Type.Optional(tagsSchema),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const operations = createLocalTaskOperations(getBackend());
      const task = await operations.start(params, { signal });
      return result(`Started task ${task.id}.`, task);
    },
  });

  pi.registerTool({
    name: "task_list",
    label: "List Tasks",
    description: "List Local Tasks in the current project scope.",
    parameters: Type.Object(
      {
        status: Type.Optional(listStatusSchema),
        priority: Type.Optional(prioritySchema),
        workspaceId: Type.Optional(taskIdSchema),
        tags: Type.Optional(tagsSchema),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const tasks = await createLocalTaskOperations(getBackend()).list(params, { signal });
      return result(
        tasks.map((task) => `${task.id} — ${task.status} — ${task.title}`).join("\n") || "No tasks found.",
        {
          tasks,
        },
      );
    },
  });

  pi.registerTool({
    name: "task_search",
    label: "Search Tasks",
    description: "Search Local Tasks in the current project scope.",
    parameters: Type.Object(
      {
        query: descriptionSchema,
        status: Type.Optional(listStatusSchema),
        priority: Type.Optional(prioritySchema),
        workspaceId: Type.Optional(taskIdSchema),
        tags: Type.Optional(tagsSchema),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const tasks = await createLocalTaskOperations(getBackend()).search(params, { signal });
      return result(
        tasks.map((task) => `${task.id} — ${task.status} — ${task.title}`).join("\n") || "No tasks found.",
        {
          tasks,
        },
      );
    },
  });

  pi.registerTool({
    name: "task_read",
    label: "Read Task",
    description: "Read synthetic task metadata or a daemon-derived context document.",
    parameters: Type.Object(
      { id: taskIdSchema, document: Type.Optional(readDocumentSchema) },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const operations = createLocalTaskOperations(getBackend());
      const document = params.document ?? "task";
      if (document === "task")
        return result(operations.formatBrief(await operations.get(params.id, { signal })), { id: params.id, document });
      const documents = createLocalTaskDocuments(operations, getBackend());
      return result(await documents.read(params.id, document, { signal }), { id: params.id, document });
    },
  });

  pi.registerTool({
    name: "task_update",
    label: "Update Task",
    description: "Update Local Task metadata without completing the task.",
    parameters: Type.Object(
      {
        id: taskIdSchema,
        title: Type.Optional(titleSchema),
        description: Type.Optional(updateDescriptionSchema),
        status: Type.Optional(updateStatusSchema),
        priority: Type.Optional(prioritySchema),
        tags: Type.Optional(tagsSchema),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { id, ...update } = params;
      const task = await createLocalTaskOperations(getBackend()).update(id, update, { signal });
      return result(`Updated task ${task.id}.`, task);
    },
  });

  pi.registerTool({
    name: "task_write",
    label: "Write Task Document",
    description: "Replace a daemon-derived plan, notes, or outcome document.",
    parameters: Type.Object(
      { id: taskIdSchema, document: writeDocumentSchema, content: contentSchema },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const operations = createLocalTaskOperations(getBackend());
      await createLocalTaskDocuments(operations, getBackend()).write(params.id, params.document, params.content, {
        signal,
      });
      return result(`Wrote ${params.document}.md for task ${params.id}.`, { id: params.id, document: params.document });
    },
  });

  pi.registerTool({
    name: "task_append_note",
    label: "Append Task Note",
    description: "Append content to a daemon-derived task notes document.",
    parameters: Type.Object({ id: taskIdSchema, content: contentSchema }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const operations = createLocalTaskOperations(getBackend());
      await createLocalTaskDocuments(operations, getBackend()).appendNote(params.id, params.content, { signal });
      return result(`Appended a note to task ${params.id}.`, { id: params.id });
    },
  });

  pi.registerTool({
    name: "task_finish",
    label: "Finish Task",
    description: "Write the outcome, then mark a Local Task completed.",
    parameters: Type.Object({ id: taskIdSchema, outcome: contentSchema }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const operations = createLocalTaskOperations(getBackend());
      const task = await createLocalTaskDocuments(operations, getBackend()).finish(params.id, params.outcome, {
        signal,
      });
      return result(`Finished task ${params.id}.`, { id: params.id, status: task.status });
    },
  });
}

/** Builds a cached production RPC client only when the first tool call needs it. */
export function createBackendResolver(backend?: LocalTaskToolBackend): BackendResolver {
  if (backend) return () => backend;
  let client: LocalTaskToolBackend | undefined;
  return () => {
    if (client) return client;
    const endpoint = process.env.YISHAN_DAEMON_WS_URL;
    if (!endpoint) throw new Error("Local Task daemon endpoint is unavailable");
    // Dynamic import is not needed: constructing the client is the only WebSocket-dependent operation.
    client = createProductionBackend(endpoint);
    return client;
  };
}

function createProductionBackend(endpoint: string): LocalTaskToolBackend {
  return new LocalTaskRpcClient(endpoint);
}

function result(text: string, details: Record<string, unknown>) {
  const truncated = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  return {
    content: [{ type: "text" as const, text: truncated.content }],
    details: { ...details, truncated: truncated.truncated },
  };
}
