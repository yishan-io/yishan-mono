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

export type DesktopUpdateEventPayload =
  | { status: "checking"; source: "auto" | "manual" }
  | { status: "available"; source: "auto" | "manual"; version?: string }
  | { status: "not-available"; source: "manual" }
  | { status: "error"; source: "manual" | "download"; message: string }
  | {
      status: "downloading";
      version?: string;
      percent?: number;
      transferred?: number;
      total?: number;
      bytesPerSecond?: number;
    }
  | { status: "downloaded"; version?: string };

export type MainWindowFullscreenState = {
  isFullscreen: boolean;
};

export type DaemonRelayStatus = {
  enabled: boolean;
  url: string;
  connected: boolean;
  connectedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
};

export type DaemonInfoResult = {
  version: string;
  daemonId: string;
  wsUrl: string;
  relay?: DaemonRelayStatus;
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

export type DesktopCliInstallStatusResult = {
  isAvailableInPath: boolean;
  resolvedPath?: string;
  isManagedInstall: boolean;
  installPath: string;
  bundledCliPath: string;
};

export type DesktopCliInstallResult =
  | {
      success: true;
      status: DesktopCliInstallStatusResult;
    }
  | {
      success: false;
      error: string;
      status?: DesktopCliInstallStatusResult;
    };

export type CopyFilesInput = {
  /** Absolute source paths to copy from (external OS paths). */
  sourcePaths: string[];
  /** Absolute path of the destination directory to copy into. */
  destinationDirectory: string;
};

export type CopyFilesResult =
  | { ok: true; copiedPaths: string[] }
  | { ok: false; error: string };

export type WriteFileBase64Input = {
  /** Absolute path of the file to write. */
  absolutePath: string;
  /** Base64-encoded file content. */
  contentBase64: string;
};

export type WriteFileBase64Result =
  | { ok: true }
  | { ok: false; error: string };

export type BrowserHistoryEntry = {
  url: string;
  title: string;
  faviconUrl?: string;
  visitedAt: string;
};

export type BrowserHistoryGroup = {
  host: string;
  faviconUrl?: string;
  entries: BrowserHistoryEntry[];
};

export type LoadBrowserHistoryResult = BrowserHistoryGroup[];

export type AppendBrowserHistoryInput = {
  entry: BrowserHistoryEntry;
};

export type DesktopHostBridge = {
  getDesktopAppVersion: () => Promise<string>;
  openLocalFolderDialog: (input?: OpenLocalFolderDialogInput) => Promise<string | null>;
  toggleMainWindowMaximized: () => Promise<{ ok: true }>;
  getMainWindowFullscreenState: () => Promise<MainWindowFullscreenState>;
  openEntryInExternalApp: (input: OpenEntryInExternalAppInput) => Promise<{ ok: true }>;
  openExternalUrl: (input: OpenExternalUrlInput) => Promise<OpenExternalUrlResult>;
  readExternalClipboardSourcePaths: () => Promise<ExternalClipboardReadOutcome>;
  copyFiles: (input: CopyFilesInput) => Promise<CopyFilesResult>;
  writeFileBase64: (input: WriteFileBase64Input) => Promise<WriteFileBase64Result>;
  loadBrowserHistory: () => Promise<LoadBrowserHistoryResult>;
  appendBrowserHistory: (input: AppendBrowserHistoryInput) => Promise<{ ok: true }>;
  dispatchNotification: (input: DispatchNotificationInput) => Promise<NotificationDispatchResult>;
  playNotificationSound: (input: PlayNotificationSoundInput) => Promise<NotificationSoundPreviewResult>;
  getPendingUpdate: () => Promise<DesktopUpdateEventPayload | null>;
  checkForUpdates: () => Promise<{ ok: true }>;
  downloadUpdate: () => Promise<{ ok: true } | { ok: false; error: string }>;
  installUpdate: () => Promise<{ ok: true }>;
  getAuthStatus: () => Promise<AuthStatusResult>;
  login: () => Promise<AuthLoginResult>;
  getDaemonInfo: () => Promise<DaemonInfoResult>;
  restartDaemon: () => Promise<DaemonRestartResult>;
  getDaemonQuitOnExit: () => Promise<boolean>;
  setDaemonQuitOnExit: (value: boolean) => Promise<{ ok: true }>;
  getDaemonJwt: () => Promise<string>;
  getDesktopCliInstallStatus: () => Promise<DesktopCliInstallStatusResult>;
  installDesktopCli: () => Promise<DesktopCliInstallResult>;
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
  getDesktopAppVersion: "desktop:host/get-desktop-app-version",
  openLocalFolderDialog: "desktop:host/open-local-folder-dialog",
  toggleMainWindowMaximized: "desktop:host/toggle-main-window-maximized",
  getMainWindowFullscreenState: "desktop:host/get-main-window-fullscreen-state",
  openEntryInExternalApp: "desktop:host/open-entry-in-external-app",
  openExternalUrl: "desktop:host/open-external-url",
  readExternalClipboardSourcePaths: "desktop:host/read-external-clipboard-source-paths",
  copyFiles: "desktop:host/copy-files",
  writeFileBase64: "desktop:host/write-file-base64",
  loadBrowserHistory: "desktop:host/load-browser-history",
  appendBrowserHistory: "desktop:host/append-browser-history",
  dispatchNotification: "desktop:host/dispatch-notification",
  playNotificationSound: "desktop:host/play-notification-sound",
  getPendingUpdate: "desktop:host/get-pending-update",
  checkForUpdates: "desktop:host/check-for-updates",
  downloadUpdate: "desktop:host/download-update",
  installUpdate: "desktop:host/install-update",
  getAuthStatus: "desktop:host/get-auth-status",
  login: "desktop:host/login",
  getDaemonInfo: "desktop:host/get-daemon-info",
  restartDaemon: "desktop:host/restart-daemon",
  getDaemonQuitOnExit: "desktop:host/get-daemon-quit-on-exit",
  setDaemonQuitOnExit: "desktop:host/set-daemon-quit-on-exit",
  getDaemonJwt: "desktop:host/get-daemon-jwt",
  getDesktopCliInstallStatus: "desktop:host/get-desktop-cli-install-status",
  installDesktopCli: "desktop:host/install-desktop-cli",
} as const;
