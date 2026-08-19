import type { NotificationPreferences } from "../../shared/notifications/notificationPreferences";
import type * as Rpc from "./daemonTypes";
import type { StartSubscriptionOptions } from "./daemonTypes";

export type ApiSubscriptionHandlers = {
  onData: (event: unknown) => void;
  onError?: (error: unknown) => void;
};

export type DaemonTransport = {
  /** Sends one raw JSON-RPC method over the wire (transport-level, no namespace parsing). */
  invoke: (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;
  /** Shared worktree-path → workspace-id cache (populated by workspace operations). */
  workspaceIdByWorktreePath: Map<string, string>;
  /** Sends one binary terminal-input frame over the raw socket (terminal adapter). */
  sendBinary: (sessionId: string, data: string | Uint8Array) => void;
  /** Current WebSocket readyState for terminal binary-path decisions. */
  getSocketReadyState: () => number | null;
  /** Shared raw subscription registry (terminal subscriptions register here). */
  subscriptionsById: Map<string, unknown>;
  /** Shared terminal-output frame index bookkeeping (raw subscription delivery). */
  terminalNextIndexBySessionId: Map<string, number>;
  /** Registers one raw daemon subscription (terminal adapter uses this). */
  startRawSubscription: (options: StartSubscriptionOptions) => Promise<string>;
};

type DaemonRpcSubscription = {
  unsubscribe: () => void;
};

export type DaemonRpcClient = {
  app: {
    getDefaultWorktreeLocation: (input?: unknown) => Promise<{ worktreePath: string }>;
    checkAgentGlobalConfigExternalDirectoryPermission: (input?: unknown) => Promise<unknown>;
    ensureAgentGlobalConfigExternalDirectoryPermission: (input?: unknown) => Promise<unknown>;
    persistAuthTokens: (input: Rpc.PersistAuthTokensInput) => Promise<{ ok: boolean }>;
    getAccessToken: (input?: unknown) => Promise<Rpc.GetAccessTokenOutput>;
    checkAuthStatus: (input?: unknown) => Promise<Rpc.CheckAuthStatusOutput>;
    logout: (input?: unknown) => Promise<Rpc.LogoutOutput>;
    reloadAuthConfig: (input?: unknown) => Promise<Rpc.ReloadAuthConfigOutput>;
  };
  computer: {
    permissions: (input?: unknown) => Promise<Rpc.ComputerPermissionStatus>;
    openPermissionSettings: (input: { permission: string }) => Promise<{ ok: boolean }>;
    getConfig: (input?: unknown) => Promise<Rpc.ComputerUseFeatureConfig>;
    updateConfig: (input: Rpc.ComputerUseFeatureConfig) => Promise<{ ok: boolean }>;
  };
  context: {
    getState: () => Promise<unknown>;
    setCurrentOrg: (orgId: string) => Promise<unknown>;
    setActiveProject: (projectId: string) => Promise<unknown>;
    setActiveFile: (filePath: string) => Promise<unknown>;
  };
  chat: {
    ensureWorkspaceChatSession: (input: unknown) => Promise<{ sessionId: string; capabilities?: unknown }>;
    runWorkspaceChatPrompt: (input: unknown) => Promise<unknown>;
    closeAgentSession: (input: { sessionId: string; deleteRecord?: boolean }) => Promise<unknown>;
  };
  pi: {
    start: (input: {
      sessionId: string;
      tabId: string;
      paneId?: string;
      workspaceId: string;
      cwd: string;
      resume?: boolean;
    }) => Promise<{ sessionId: string }>;
    attach: (input: { sessionId: string; tabId?: string; workspaceId?: string; cwd?: string }) => Promise<{
      ok: boolean;
    }>;
    stop: (input: { sessionId: string }) => Promise<{ ok: boolean }>;
    send: (input: { sessionId: string; command: unknown }) => Promise<unknown>;
    rename: (input: { sessionId: string; title: string }) => Promise<{ ok: boolean }>;
    listSessions: (input: Rpc.PiListSessionsInput) => Promise<Rpc.PiSessionSummary[]>;
    getSessionFile: (input: Rpc.PiGetSessionFileInput) => Promise<Rpc.PiGetSessionFileResult>;
    listActiveSessions: (input?: Rpc.PiListActiveSessionsInput) => Promise<Rpc.PiActiveSessionSummary[]>;
    listProviders: (input?: unknown) => Promise<{
      providers: Array<{ provider: string; type: string; source?: string; envVars?: string[] }>;
    }>;
    saveProvider: (input: { provider: string; key: string; env?: Record<string, string> }) => Promise<{ ok: boolean }>;
    removeProvider: (input: { provider: string }) => Promise<{ ok: boolean }>;
  };
  agent: {
    listDetectionStatuses: (input?: unknown) => Promise<unknown>;
    listModels: (input?: { agentKind?: string; forceRefresh?: boolean }) => Promise<{
      agentKind: string;
      models: Array<{ id: string; name: string }>;
      source: string;
      fetchedAt: number;
      cacheExpiry: number;
    }>;
  };
  cliTools: {
    listStatuses: (input?: { refresh?: boolean }) => Promise<
      Array<{
        toolId: string;
        category: string;
        label: string;
        installed: boolean;
        version?: string;
        authenticated?: boolean;
        account?: string;
        statusDetail: string;
        supportsToggle?: boolean;
        resolvedPath?: string;
        managedInstall?: boolean;
        latestVersion?: string;
      }>
    >;
    install: (input: { toolId: string }) => Promise<{
      ok: true;
      status?: {
        toolId: string;
        category: string;
        label: string;
        installed: boolean;
        version?: string;
        authenticated?: boolean;
        account?: string;
        statusDetail: string;
        supportsToggle?: boolean;
        resolvedPath?: string;
        managedInstall?: boolean;
        latestVersion?: string;
      };
    }>;
    uninstall: (input: { toolId: string }) => Promise<{
      ok: true;
      status?: {
        toolId: string;
        category: string;
        label: string;
        installed: boolean;
        version?: string;
        authenticated?: boolean;
        account?: string;
        statusDetail: string;
        supportsToggle?: boolean;
        resolvedPath?: string;
        managedInstall?: boolean;
        latestVersion?: string;
      };
    }>;
  };
  integration: {
    githubStatus: (input?: { refresh?: boolean }) => Promise<{
      installed: boolean;
      loggedIn: boolean;
      username?: string;
      statusDetail: string;
    }>;
  };
  notification: {
    getNotificationPreferences: (input?: unknown) => Promise<NotificationPreferences>;
    updateNotificationPreferences: (input: unknown) => Promise<NotificationPreferences>;
  };
  events: {
    frontendStream: {
      subscribe: (
        input: undefined,
        handlers: {
          onData: (event: { topic: string; payload: unknown }) => void;
          onError?: (error: unknown) => void;
        },
      ) => DaemonRpcSubscription;
    };
  };
  skill: {
    list: (input?: undefined) => Promise<Rpc.SkillListResponse>;
    info: (input: { name: string }) => Promise<Rpc.SkillInfo>;
    detail: (input: { name: string }) => Promise<Rpc.SkillDetail>;
    add: (input: { source: string }) => Promise<{ added: boolean }>;
    remove: (input: { name: string }) => Promise<{ removed: boolean }>;
    update: (input: { name: string }) => Promise<{ updated: boolean }>;
    updateAll: (input?: undefined) => Promise<{ updated: boolean }>;
  };
  customize: {
    extensions: {
      list: (input?: undefined) => Promise<Rpc.PiExtensionListResponse>;
      install: (input: Rpc.PiExtensionMutationInput) => Promise<{ installed: boolean }>;
      remove: (input: Rpc.PiExtensionMutationInput) => Promise<{ removed: boolean }>;
      update: (input: Rpc.PiExtensionMutationInput) => Promise<{ updated: boolean }>;
    };
    agents: {
      list: (input?: undefined) => Promise<Rpc.AgentDefinitionListResponse>;
      detail: (input: Rpc.AgentDefinitionNameInput) => Promise<Rpc.AgentDefinitionDetail>;
      create: (input: Rpc.AgentDefinitionCreateInput) => Promise<{ created: boolean }>;
      update: (input: Rpc.AgentDefinitionUpdateInput) => Promise<{ updated: boolean }>;
      remove: (input: Rpc.AgentDefinitionNameInput) => Promise<{ removed: boolean }>;
      restore: (input: Rpc.AgentDefinitionNameInput) => Promise<{ restored: boolean }>;
    };
  };
  memory: {
    search: (input: Rpc.MemorySearchInput) => Promise<Rpc.MemorySearchResult[]>;
    reconcile: (input?: unknown) => Promise<Rpc.MemoryReconcileResult>;
    status: (input?: unknown) => Promise<{ enabled: boolean }>;
    updateConfig: (input: Rpc.MemoryUpdateConfigInput) => Promise<{ ok: boolean }>;
    getConfig: (input?: unknown) => Promise<Rpc.MemoryConfig>;
  };
  tokenUsage: {};
};
