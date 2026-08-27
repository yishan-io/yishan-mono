/**
 * Agent wire DTOs (desktop7 Phase 26). Owned by the Agent Domain
 * Infrastructure; the daemon payload shapes are the transport contract.
 * The root `rpc/wire` keeps only the wire protocol itself.
 */

export type SkillSourceKind = "official" | "url" | "global" | "project" | "package" | "settings";

export type SkillInfo = {
  name: string;
  description: string;
  version: string;
  source: string;
  sourceKind: SkillSourceKind;
  installed: boolean;
  installedForAgents: string[];
  official: boolean;
  canUpdate: boolean;
  hasUpdate: boolean;
};

export type SkillDetail = SkillInfo & {
  files: Record<string, string>;
};

export type SkillListResponse = {
  skills: SkillInfo[];
};

export type PiExtensionInfo = {
  name: string;
  description: string;
  source: string;
  version: string;
  latestVersion: string;
  hasUpdate: boolean;
  official: boolean;
  installed: boolean;
};

export type PiExtensionListResponse = {
  extensions: PiExtensionInfo[];
};

export type PiExtensionMutationInput = {
  source: string;
};

export type AgentDefinitionInfo = {
  name: string;
  description: string;
  model: string;
  thinking: string;
  tools: string[];
  official: boolean;
};

export type AgentDefinitionListResponse = {
  agents: AgentDefinitionInfo[];
};

export type AgentDefinitionDetail = AgentDefinitionInfo & {
  content: string;
};

export type AgentDefinitionCreateInput = {
  name: string;
  description: string;
  content: string;
  model: string;
  thinking: string;
  tools: string[];
};

export type AgentDefinitionUpdateInput = {
  name: string;
  content: string;
};

export type AgentDefinitionNameInput = {
  name: string;
};

export type MemorySearchInput = {
  query: string;
  workspaceId?: string;
  scope?: string;
  limit?: number;
};

export type MemorySearchResult = {
  path: string;
  snippet: string;
  score: number;
};

export type MemoryReconcileResult = {
  inserted: number;
  updated: number;
  deleted: number;
};

export type MemoryUpdateConfigInput = {
  enabled: boolean;
  agentKind: string;
  model: string;
};

export type MemoryConfig = {
  enabled: boolean;
  agentKind: string;
  model: string;
};

export type PiListSessionsInput = {
  cwd: string;
};

export type PiGetSessionFileInput = {
  sessionId: string;
  cwd: string;
};

export type PiGetSessionFileResult = {
  /** Full transcript path; empty when no transcript exists yet. */
  filePath: string;
};

export type PiListActiveSessionsInput = Record<string, never>;

export type PiSessionSummary = {
  sessionId: string;
  timestamp: string;
  model?: string;
  previewText?: string;
  sessionName?: string;
  cwd?: string;
};

/** One live agent-chat session. Session identity is shared by daemon runtime and Pi resume. */
export type PiActiveSessionSummary = {
  sessionId: string;
  tabId: string;
  workspaceId: string;
  cwd: string;
};

export type ComputerUseFeatureConfig = {
  enabled: boolean;
  observe: boolean;
  capture: boolean;
  inspect: boolean;
  actions: boolean;
  mouse: boolean;
  keyboard: boolean;
  clipboardRead: boolean;
  clipboardWrite: boolean;
  applicationControl: boolean;
};

export type ComputerPermissionState =
  | "granted"
  | "denied"
  | "unknown"
  | "notRequired"
  | "notRequested"
  | "checkManually"
  | "entitled";

export type ComputerPermissionStatus = {
  accessibility: ComputerPermissionState;
  screenRecording: ComputerPermissionState;
  inputMonitoring: ComputerPermissionState;
  automation: ComputerPermissionState;
  camera: ComputerPermissionState;
  fullDiskAccess: ComputerPermissionState;
  localNetwork: ComputerPermissionState;
  usbDevices: ComputerPermissionState;
  bluetooth: ComputerPermissionState;
  prompted?: boolean;
  remediation?: string[];
};

/** Identifies the execution runtime selected by runtime-neutral agent procedures. */
export type AgentRuntime = "pi" | "dsh";

/** Reports which daemon-owned agent runtimes can start new sessions. */
export type AgentCapabilities = {
  dsh: {
    configured: boolean;
    ready: boolean;
    incarnation?: string;
    transcriptProtocolVersion: number;
    provider?: string;
    model?: string;
    credentialRef?: string;
  };
};

/** Starts a runtime-neutral agent session. */
export type AgentStartRequest = {
  runtime: AgentRuntime;
  sessionId: string;
  tabId: string;
  paneId?: string;
  workspaceId: string;
  cwd: string;
  resume?: boolean;
  /** For DSH sessions: the selected model id to use for this session. */
  modelId?: string;
};

/** Attaches the current daemon connection to an existing agent session. */
export type AgentAttachRequest = {
  runtime: AgentRuntime;
  sessionId: string;
  tabId?: string;
  workspaceId: string;
  cwd: string;
  /** DSH replay cursor; a first DSH attach must use -1. */
  afterSeq?: number;
};

/** Sends one runtime-neutral prompt to an agent session. */
export type AgentPromptRequest = {
  runtime: AgentRuntime;
  sessionId: string;
  workspaceId: string;
  cwd: string;
  message: unknown;
  streamingBehavior?: string;
};

/** Aborts a running agent session without disposing its resources. */
export type AgentAbortRequest = {
  runtime: AgentRuntime;
  sessionId: string;
  workspaceId: string;
  cwd: string;
};

/** Disposes an agent session and its runtime resources. */
export type AgentDisposeRequest = AgentAbortRequest;

/** Lists durable sessions for one runtime and workspace. */
export type AgentListSessionsRequest = {
  runtime: AgentRuntime;
  workspaceId: string;
  cwd: string;
};

/** Reads durable history for one runtime session. */
export type AgentReadHistoryRequest = {
  runtime: AgentRuntime;
  sessionId: string;
  workspaceId: string;
  cwd: string;
};

/** Selects direct DSH subagents or all DSH descendants. */
export type AgentSessionLineageMode = "children" | "descendants";

/** Lists native DSH subagents below one open workspace session. */
export type AgentListSessionLineageRequest = {
  runtime: "dsh";
  workspaceId: string;
  cwd: string;
  rootSessionId: string;
  mode: AgentSessionLineageMode;
};

/** One native DSH subagent in a session lineage response. */
export type AgentSessionLineageEntry = {
  sessionId: string;
  parentSessionId: string;
  origin: "subagent";
  delegationDepth: number;
  relativeDepth: number;
  live: boolean;
  persisted: boolean;
  activity?: "running" | "inactive";
  mode?: "one-shot" | "continuable";
  label?: string;
};

/** Returns the DSH-native lineage below a requested root session. */
export type AgentSessionLineageResult = {
  runtime: "dsh";
  rootSessionId: string;
  mode: AgentSessionLineageMode;
  children: AgentSessionLineageEntry[];
};

/** Requests interruption of one direct DSH subagent. */
export type AgentCancelSubagentRequest = {
  runtime: "dsh";
  workspaceId: string;
  cwd: string;
  parentSessionId: string;
  childSessionId: string;
};

/** Reports whether the DSH runtime accepted an interrupt request. */
export type AgentCancelSubagentResult = {
  runtime: "dsh";
  parentSessionId: string;
  childSessionId: string;
  interruptRequested: boolean;
};

/** Returns the runtime and session identity after a successful start. */
export type AgentStartResult = {
  runtime: AgentRuntime;
  sessionId: string;
};

/** Acknowledges a runtime-neutral session mutation. */
export type AgentAckResult = {
  runtime: AgentRuntime;
  ok: boolean;
};

/** Seeds DSH attach state from the daemon's authoritative replay merge. */
export type AgentDSHAttachResult = {
  runtime: "dsh";
  sessionId: string;
  incarnation: string;
  events: unknown[];
  /** Durable baseline cursor; it equals durableThroughSeq for the current protocol. */
  asOfSeq: number;
  durableThroughSeq: number;
  /** Highest event sequence represented by events, including in-memory replay. */
  headSeq: number;
};

/** Returns an acknowledgement for Pi or a controller seed for DSH. */
export type AgentAttachResult = AgentAckResult | AgentDSHAttachResult;

/** Summarizes one durable session across agent runtimes. */
export type AgentSessionSummary = {
  sessionId: string;
  /** Authoritative workspace path resolved by the daemon. */
  cwd: string;
  createdAt: number;
  model?: string;
  previewText?: string;
  sessionName?: string;
  parentSession?: string;
  agentPreset?: string;
  live: boolean;
  persisted: boolean;
};

/** Returns durable sessions tagged with their selected runtime. */
export type AgentSessionsResult = {
  runtime: AgentRuntime;
  sessions: AgentSessionSummary[];
};

/** Identifies Pi's durable transcript file. */
export type AgentPiHistory = {
  filePath: string;
};

/** Identifies a durable DSH session. */
export type AgentDSHSessionMetadata = {
  sessionId: string;
  createdAt: number;
  parentSession?: string;
  agentPreset?: string;
};

/** Contains DSH durable history without interpreting individual event payloads. */
export type AgentDSHHistory = {
  session: AgentDSHSessionMetadata;
  events: unknown[];
  incarnation: string;
  asOfSeq: number;
  durableThroughSeq: number;
};

/** Returns Pi durable history for a Pi runtime request. */
export type AgentPiHistoryResult = {
  runtime: "pi";
  pi: AgentPiHistory;
};

/** Returns DSH durable history for a DSH runtime request. */
export type AgentDSHHistoryResult = {
  runtime: "dsh";
  dsh: AgentDSHHistory;
};

/** Returns the runtime-tagged durable history for one agent session. */
export type AgentHistoryResult = AgentPiHistoryResult | AgentDSHHistoryResult;
