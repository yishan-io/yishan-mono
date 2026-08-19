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

/**
 * Agent wire DTOs (skill/pi/agent-definition/memory/computer-use/session)
 * moved to `domains/agent/infrastructure/daemonAgentTypes` (desktop7
 * Phase 26). This module keeps only the wire protocol and app auth contract.
 */
