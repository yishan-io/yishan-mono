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
};
