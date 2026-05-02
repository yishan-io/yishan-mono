import type { WorkspaceEntryAppId } from "../shared/contracts/externalApps";
import type { ExternalClipboardReadOutcome } from "../shared/contracts/rpcRequestTypes";
import type { NotificationSoundId } from "../shared/notifications/notificationPreferences";
import type { NotificationDispatchResult, NotificationSoundPreviewResult } from "./notifications/types";

export type DesktopRpcEventEnvelope = {
  method: string;
  payload?: unknown;
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

export type DesktopUpdateEventPayload = {
  version?: string;
};

export type MainWindowFullscreenState = {
  isFullscreen: boolean;
};

export type DaemonInfoResult = {
  version: string;
  daemonId: string;
  wsUrl: string;
};

export type DaemonRestartResult =
  | { success: true; daemonInfo: DaemonInfoResult }
  | { success: false; error: string };

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
  getPendingUpdate: () => Promise<DesktopUpdateEventPayload | null>;
  installUpdate: () => Promise<{ ok: true }>;
  getAuthStatus: () => Promise<AuthStatusResult>;
  login: () => Promise<AuthLoginResult>;
  getAuthTokens: () => Promise<AuthTokensResult>;
  getDaemonInfo: () => Promise<DaemonInfoResult>;
  restartDaemon: () => Promise<DaemonRestartResult>;
  getDaemonQuitOnExit: () => Promise<boolean>;
  setDaemonQuitOnExit: (value: boolean) => Promise<{ ok: true }>;
};

export type DesktopRpcEventBridge = {
  subscribe: (listener: (envelope: DesktopRpcEventEnvelope) => void) => () => void;
};

export type DesktopBridge = {
  host: DesktopHostBridge;
  events: DesktopRpcEventBridge;
};

export const DESKTOP_RPC_IPC_CHANNELS = {
  event: "desktop:rpc/event",
} as const;

export const HOST_IPC_CHANNELS = {
  openLocalFolderDialog: "desktop:host/open-local-folder-dialog",
  toggleMainWindowMaximized: "desktop:host/toggle-main-window-maximized",
  getMainWindowFullscreenState: "desktop:host/get-main-window-fullscreen-state",
  openEntryInExternalApp: "desktop:host/open-entry-in-external-app",
  openExternalUrl: "desktop:host/open-external-url",
  readExternalClipboardSourcePaths: "desktop:host/read-external-clipboard-source-paths",
  dispatchNotification: "desktop:host/dispatch-notification",
  playNotificationSound: "desktop:host/play-notification-sound",
  getPendingUpdate: "desktop:host/get-pending-update",
  installUpdate: "desktop:host/install-update",
  getAuthStatus: "desktop:host/get-auth-status",
  login: "desktop:host/login",
  getAuthTokens: "desktop:host/get-auth-tokens",
  getDaemonInfo: "desktop:host/get-daemon-info",
  restartDaemon: "desktop:host/restart-daemon",
  getDaemonQuitOnExit: "desktop:host/get-daemon-quit-on-exit",
  setDaemonQuitOnExit: "desktop:host/set-daemon-quit-on-exit",
} as const;
