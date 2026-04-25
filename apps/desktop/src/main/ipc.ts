import type { WorkspaceEntryAppId } from "../shared/contracts/externalApps";
import type { ExternalClipboardReadOutcome } from "../shared/contracts/rpcRequestTypes";
import type {  NotificationSoundId } from "../shared/notifications/notificationPreferences";
import type { NotificationDispatchResult, NotificationSoundPreviewResult } from "./notifications/types";

export type DesktopRpcEventEnvelope = {
  method: string;
  payload?: unknown;
};

export type DesktopApiNamespace = "workspace" | "file" | "git" | "terminal";

export type InvokeApiProcedureInput = {
  namespace: DesktopApiNamespace;
  method: string;
  input?: unknown;
};

export type StartApiSubscriptionInput = {
  namespace: DesktopApiNamespace;
  method: string;
  input?: unknown;
};

export type StopApiSubscriptionInput = {
  subscriptionId: string;
};

export type DesktopApiBridge = {
  invoke: (input: InvokeApiProcedureInput) => Promise<unknown>;
  startSubscription: (input: StartApiSubscriptionInput) => Promise<{ subscriptionId: string }>;
  stopSubscription: (input: StopApiSubscriptionInput) => Promise<{ stopped: true }>;
};

export type OpenLocalFolderDialogInput = {
  startingFolder?: string;
};

export type OpenEntryInExternalAppInput = {
  workspaceWorktreePath: string;
  appId: WorkspaceEntryAppId;
  relativePath?: string;
};

export type OpenExternalUrlInput = {
  url: string;
};

export type OpenExternalUrlResult =
  | { opened: true }
  | {
      opened: false;
      reason: "invalid-url" | "unsupported-protocol" | "open-failed";
    };

export type DispatchNotificationInput = {
  title: string;
  body?: string;
};

export type PlayNotificationSoundInput = {
  soundId: NotificationSoundId;
  volume: number;
};

export type MainWindowFullscreenState = {
  isFullscreen: boolean;
};

export type DaemonInfoResult = {
  version: string;
  daemonId: string;
};

export type AuthStatusResult = {
  authenticated: boolean;
  expiresAt?: string;
  error?: string;
};

export type AuthLoginResult = {
  authenticated: boolean;
  skipped: boolean;
  error?: string;
};

export type AuthTokensResult = {
  authenticated: boolean;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  error?: string;
};

export type DesktopHostBridge = {
  openLocalFolderDialog: (input?: OpenLocalFolderDialogInput) => Promise<string | null>;
  toggleMainWindowMaximized: () => Promise<{ ok: true }>;
  getMainWindowFullscreenState: () => Promise<MainWindowFullscreenState>;
  openEntryInExternalApp: (input: OpenEntryInExternalAppInput) => Promise<{ ok: true }>;
  openExternalUrl: (input: OpenExternalUrlInput) => Promise<OpenExternalUrlResult>;
  readExternalClipboardSourcePaths: () => Promise<ExternalClipboardReadOutcome>;
  dispatchNotification: (input: DispatchNotificationInput) => Promise<NotificationDispatchResult>;
  playNotificationSound: (input: PlayNotificationSoundInput) => Promise<NotificationSoundPreviewResult>;
  getAuthStatus: () => Promise<AuthStatusResult>;
  login: () => Promise<AuthLoginResult>;
  getAuthTokens: () => Promise<AuthTokensResult>;
  getDaemonInfo: () => Promise<DaemonInfoResult>;
};

export type DesktopBridge = {
  host: DesktopHostBridge;
  api: DesktopApiBridge;
  subscribeDesktopRpcEvent: (listener: (envelope: DesktopRpcEventEnvelope) => void) => () => void;
};

export const HOST_IPC_CHANNELS = {
  openLocalFolderDialog: "desktop:host/open-local-folder-dialog",
  toggleMainWindowMaximized: "desktop:host/toggle-main-window-maximized",
  getMainWindowFullscreenState: "desktop:host/get-main-window-fullscreen-state",
  openEntryInExternalApp: "desktop:host/open-entry-in-external-app",
  openExternalUrl: "desktop:host/open-external-url",
  readExternalClipboardSourcePaths: "desktop:host/read-external-clipboard-source-paths",
  dispatchNotification: "desktop:host/dispatch-notification",
  playNotificationSound: "desktop:host/play-notification-sound",
  getAuthStatus: "desktop:host/get-auth-status",
  login: "desktop:host/login",
  getAuthTokens: "desktop:host/get-auth-tokens",
  getDaemonInfo: "desktop:host/get-daemon-info",
} as const;

/** IPC channels used to forward normalized desktop RPC envelopes from main process to renderer. */
export const DESKTOP_RPC_IPC_CHANNELS = {
  event: "desktop:rpc/event",
} as const;

export const API_RPC_IPC_CHANNELS = {
  invoke: "desktop:api/invoke",
  startSubscription: "desktop:api/start-subscription",
  stopSubscription: "desktop:api/stop-subscription",
} as const;
