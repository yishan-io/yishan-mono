export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type DaemonState = {
  host: string;
  port: number;
};

export type DaemonNotification = {
  method: string;
  payload: unknown;
};

export type StartSubscriptionOptions = {
  method: string;
  params?: unknown;
  onNotification: (event: DaemonNotification) => void;
};

export type ProcedureNotification = {
  method: string;
  payload: unknown;
};

export type ApiNamespace =
  | "app"
  | "computer"
  | "context"
  | "workspace"
  | "file"
  | "git"
  | "terminal"
  | "chat"
  | "pi"
  | "agent"
  | "cliTools"
  | "integration"
  | "notification"
  | "events"
  | "skill"
  | "memory"
  | "project"
  | "customize";

export type ProcedureSubscriptionOptions = {
  namespace: ApiNamespace;
  method: string;
  input?: unknown;
  onNotification: (event: ProcedureNotification) => void;
};

export type PersistAuthTokensInput = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
};

export type GetAccessTokenOutput = {
  accessToken: string;
  accessTokenExpiresAt?: string;
};

export type CheckAuthStatusOutput = {
  authenticated: boolean;
  accessTokenExpiresAt?: string;
};

export type LogoutOutput = {
  ok: boolean;
};

export type ReloadAuthConfigOutput = {
  ok: boolean;
};

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
