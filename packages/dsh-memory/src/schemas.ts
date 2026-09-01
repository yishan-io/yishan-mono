/** Parameters for searching durable memory. */
export const memorySearchParameters = {
  query: { type: "string", required: true, description: "One to three keywords to search for." },
  projectId: { type: "string", description: "Optional project id. Defaults to the current workspace project." },
  scope: { type: "string", enum: ["project", "global"], description: "Search scope." },
  limit: { type: "number", description: "Maximum number of results." },
} as const;

/** Parameters for reading one memory file. */
export const memoryReadParameters = {
  projectRoot: { type: "string", description: "Optional project root within the authorized workspace." },
  path: { type: "string", required: true, description: "Relative path below .my-context." },
} as const;

/** Parameters for storing one memory entry. */
export const memoryStoreParameters = {
  projectRoot: { type: "string", description: "Optional project root within the authorized workspace." },
  section: {
    type: "string",
    required: true,
    enum: ["locked_decisions", "durable_discoveries"],
    description: "MEMORY.md section to update.",
  },
  entry: { type: "string", required: true, description: "Durable memory entry text." },
  date: { type: "string", required: true, description: "Entry date in YYYY-MM-DD format." },
} as const;

export const memorySearchOutputSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: { type: "string", required: true },
      snippet: { type: "string", required: true },
      score: { type: "number", required: true },
      source: { type: "string" },
      taskId: { type: "string" },
      taskTitle: { type: "string" },
      documentType: { type: "string" },
    },
  },
} as const;

export const memoryReadOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string", required: true },
    content: { type: "string", required: true },
  },
} as const;

export const memoryStoreOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string", required: true },
    section: { type: "string", required: true },
  },
} as const;

export const memoryReconcileOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    inserted: { type: "number", required: true },
    updated: { type: "number", required: true },
    deleted: { type: "number", required: true },
  },
} as const;
