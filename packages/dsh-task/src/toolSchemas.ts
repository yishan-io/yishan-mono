const id = { type: "string" } as const;
const content = { type: "string" } as const;
const title = { type: "string" } as const;
const description = { type: "string" } as const;
const updateDescription = { type: "string" } as const;
const tag = { type: "string" } as const;
const tags = { type: "array", items: tag } as const;
const priority = { type: "string", enum: ["low", "medium", "high"] } as const;
const status = { type: "string", enum: ["new", "progressing", "done", "cancelled"] } as const;
const statusFilter = {
  oneOf: [status, { type: "array", items: status }],
} as const;
const updateStatus = { type: "string", enum: ["new", "progressing", "cancelled"] } as const;
const readDocument = { type: "string", enum: ["task", "notes", "plan", "outcome"] } as const;
const writeDocument = { type: "string", enum: ["notes", "plan", "outcome"] } as const;

export const taskStartParameters = {
  title: { ...title, required: true },
  description,
  goal: description,
  context: description,
  acceptanceCriteria: {
    type: "array",
    items: { type: "string" },
  },
  priority,
  tags,
  workspaceId: id,
} as const;
export const taskListParameters = { status: statusFilter, priority, workspaceId: id, tags } as const;
export const taskSearchParameters = {
  query: { ...description, required: true },
  ...taskListParameters,
} as const;
export const taskReadParameters = { id: { ...id, required: true }, document: readDocument } as const;
export const taskUpdateParameters = {
  id: { ...id, required: true },
  title,
  description: updateDescription,
  status: updateStatus,
  priority,
  tags,
} as const;
export const taskWriteParameters = {
  id: { ...id, required: true },
  document: { ...writeDocument, required: true },
  content: { ...content, required: true },
} as const;
export const taskAppendNoteParameters = {
  id: { ...id, required: true },
  content: { ...content, required: true },
} as const;
export const taskFinishParameters = {
  id: { ...id, required: true },
  outcome: { ...content, required: true },
} as const;

const tagRefOutput = {
  type: "object",
  additionalProperties: false,
  properties: { id: { type: "string", required: true }, name: { type: "string" } },
} as const;
const localTaskProperties = {
  id: { type: "string", required: true },
  projectId: { oneOf: [{ type: "string" }, { type: "null" }], required: true },
  title: { type: "string", required: true },
  description: { type: "string", required: true },
  status: { ...status, required: true },
  priority: { ...priority, required: true },
  createdAt: { type: "string", required: true },
  updatedAt: { type: "string", required: true },
  completedAt: { oneOf: [{ type: "string" }, { type: "null" }], required: true },
  tags: { type: "array", items: { type: "string" }, required: true },
  tagRefs: { type: "array", items: tagRefOutput, required: true },
} as const;
export const taskResultOutput = {
  type: "object",
  additionalProperties: false,
  properties: localTaskProperties,
} as const;
export const taskListOutput = {
  type: "object",
  additionalProperties: false,
  properties: { tasks: { type: "array", items: taskResultOutput, required: true } },
} as const;
const taskSearchItemOutput = {
  type: "object",
  additionalProperties: false,
  properties: { ...localTaskProperties, rank: { type: "number", required: true } },
} as const;
export const taskSearchOutput = {
  type: "object",
  additionalProperties: false,
  properties: { tasks: { type: "array", items: taskSearchItemOutput, required: true } },
} as const;
export const taskReadOutput = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        document: { type: "string", const: "task", required: true },
        task: { ...taskResultOutput, required: true },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", required: true },
        document: { type: "string", enum: ["notes", "plan", "outcome"], required: true },
        content: { type: "string", required: true },
      },
    },
  ],
} as const;
export const taskWriteOutput = {
  type: "object",
  additionalProperties: false,
  properties: { id: { type: "string", required: true }, document: { type: "string" }, status: { type: "string" } },
} as const;
export const taskTemplatesOutput = {
  type: "object",
  additionalProperties: false,
  properties: {
    agentDefaultId: { type: "string", required: true },
    template: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
        content: { type: "string", required: true },
      },
    },
  },
} as const;
