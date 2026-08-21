import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, type TSchema, Type } from "typebox";

/** CodeGraph symbol kinds accepted by {@link codeGraphSearchParameters}. */
export const CODEGRAPH_SYMBOL_KINDS = [
  "function",
  "method",
  "class",
  "interface",
  "type",
  "variable",
  "route",
  "component",
] as const;

/** CodeGraph file-list formats accepted by {@link codeGraphFilesParameters}. */
export const CODEGRAPH_FILE_FORMATS = ["tree", "flat", "grouped"] as const;

const projectPathParameter = Type.Optional(
  Type.String({ description: "Absolute project path. Defaults to the active Pi project." }),
);

/** Parameters for the `codegraph_search` tool. */
export const codeGraphSearchParameters = Type.Object({
  query: Type.String({ description: "Symbol or structural-code query." }),
  kind: Type.Optional(StringEnum(CODEGRAPH_SYMBOL_KINDS)),
  limit: Type.Optional(Type.Number({ default: 10 })),
  projectPath: projectPathParameter,
});

/** Parameters for the `codegraph_callers` tool. */
export const codeGraphCallersParameters = Type.Object({
  symbol: Type.String({ description: "Symbol whose callers to find." }),
  limit: Type.Optional(Type.Number({ default: 20 })),
  projectPath: projectPathParameter,
});

/** Parameters for the `codegraph_callees` tool. */
export const codeGraphCalleesParameters = Type.Object({
  symbol: Type.String({ description: "Symbol whose callees to find." }),
  limit: Type.Optional(Type.Number({ default: 20 })),
  projectPath: projectPathParameter,
});

/** Parameters for the `codegraph_impact` tool. */
export const codeGraphImpactParameters = Type.Object({
  symbol: Type.String({ description: "Symbol whose impact to analyze." }),
  depth: Type.Optional(Type.Number({ default: 2 })),
  projectPath: projectPathParameter,
});

/** Parameters for the `codegraph_explore` tool. */
export const codeGraphExploreParameters = Type.Object({
  query: Type.String({ description: "Structural-code query to explore." }),
  maxFiles: Type.Optional(Type.Number({ default: 12 })),
  projectPath: projectPathParameter,
});

/** Parameters for the `codegraph_node` tool. */
export const codeGraphNodeParameters = Type.Object({
  symbol: Type.String({ description: "Symbol to inspect." }),
  includeCode: Type.Optional(Type.Boolean({ default: false })),
  projectPath: projectPathParameter,
});

/** Parameters for the `codegraph_status` tool. */
export const codeGraphStatusParameters = Type.Object({ projectPath: projectPathParameter });

/** Parameters for the `codegraph_files` tool. */
export const codeGraphFilesParameters = Type.Object({
  path: Type.Optional(Type.String({ description: "Project-relative path to list." })),
  pattern: Type.Optional(Type.String({ description: "Glob pattern to filter files." })),
  format: Type.Optional(StringEnum(CODEGRAPH_FILE_FORMATS, { default: "tree" })),
  includeMetadata: Type.Optional(Type.Boolean({ default: true })),
  maxDepth: Type.Optional(Type.Number()),
  projectPath: projectPathParameter,
});

/** The names of the frozen CodeGraph Pi tool contract. */
export type CodeGraphToolName =
  | "codegraph_search"
  | "codegraph_callers"
  | "codegraph_callees"
  | "codegraph_impact"
  | "codegraph_explore"
  | "codegraph_node"
  | "codegraph_status"
  | "codegraph_files";

/** Shared metadata for one frozen CodeGraph Pi and MCP tool contract. */
export interface CodeGraphToolDefinition<TParameters extends TSchema = TSchema> {
  /** The Pi tool name. */
  readonly name: CodeGraphToolName;
  /** The identically named MCP `tools/call` method. */
  readonly mcpMethod: CodeGraphToolName;
  /** The label shown in Pi tool UIs. */
  readonly label: string;
  /** The model-facing description of the tool. */
  readonly description: string;
  /** The TypeBox schema used to validate Pi tool parameters. */
  readonly parameters: TParameters;
}

/** Validated parameters for `codegraph_search`. */
export type CodeGraphSearchParameters = Static<typeof codeGraphSearchParameters>;
/** Validated parameters for `codegraph_callers`. */
export type CodeGraphCallersParameters = Static<typeof codeGraphCallersParameters>;
/** Validated parameters for `codegraph_callees`. */
export type CodeGraphCalleesParameters = Static<typeof codeGraphCalleesParameters>;
/** Validated parameters for `codegraph_impact`. */
export type CodeGraphImpactParameters = Static<typeof codeGraphImpactParameters>;
/** Validated parameters for `codegraph_explore`. */
export type CodeGraphExploreParameters = Static<typeof codeGraphExploreParameters>;
/** Validated parameters for `codegraph_node`. */
export type CodeGraphNodeParameters = Static<typeof codeGraphNodeParameters>;
/** Validated parameters for `codegraph_status`. */
export type CodeGraphStatusParameters = Static<typeof codeGraphStatusParameters>;
/** Validated parameters for `codegraph_files`. */
export type CodeGraphFilesParameters = Static<typeof codeGraphFilesParameters>;

/** The complete, ordered eight-tool CodeGraph Pi and MCP contract. */
export const CODEGRAPH_TOOLS = [
  {
    name: "codegraph_search",
    mcpMethod: "codegraph_search",
    label: "Search CodeGraph",
    description: "Search indexed symbols by name, kind, or structural-code query.",
    parameters: codeGraphSearchParameters,
  },
  {
    name: "codegraph_callers",
    mcpMethod: "codegraph_callers",
    label: "Find Callers",
    description: "Find symbols that call a selected symbol.",
    parameters: codeGraphCallersParameters,
  },
  {
    name: "codegraph_callees",
    mcpMethod: "codegraph_callees",
    label: "Find Callees",
    description: "Find symbols called by a selected symbol.",
    parameters: codeGraphCalleesParameters,
  },
  {
    name: "codegraph_impact",
    mcpMethod: "codegraph_impact",
    label: "Analyze Impact",
    description: "Analyze the structural impact of changing a symbol.",
    parameters: codeGraphImpactParameters,
  },
  {
    name: "codegraph_explore",
    mcpMethod: "codegraph_explore",
    label: "Explore Code",
    description: "Explore code structure relevant to a natural-language query.",
    parameters: codeGraphExploreParameters,
  },
  {
    name: "codegraph_node",
    mcpMethod: "codegraph_node",
    label: "Inspect Symbol",
    description: "Inspect one indexed symbol and optionally include its source code.",
    parameters: codeGraphNodeParameters,
  },
  {
    name: "codegraph_status",
    mcpMethod: "codegraph_status",
    label: "CodeGraph Status",
    description: "Show CodeGraph index and project status.",
    parameters: codeGraphStatusParameters,
  },
  {
    name: "codegraph_files",
    mcpMethod: "codegraph_files",
    label: "List CodeGraph Files",
    description: "List indexed project files in a tree, flat, or grouped format.",
    parameters: codeGraphFilesParameters,
  },
] as const satisfies readonly CodeGraphToolDefinition[];
