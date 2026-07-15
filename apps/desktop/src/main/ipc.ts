import type { WorkspaceEntryAppId } from "../shared/contracts/externalApps";
import type {
  AuthenticatePiProviderInput,
  PiAuthPromptResponseInput,
  PiProviderConfigMutationResult,
  PiProviderConfigResult,
  PiProviderConfigSnapshot,
  PiProviderConfigSnapshotResult,
} from "../shared/contracts/piProviderConfig";
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
  silent?: boolean;
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

export type DaemonRestartResult = { success: true; daemonInfo: DaemonInfoResult } | { success: false; error: string };

export type DaemonLogResult = { ok: true; content: string } | { ok: false; error: string };

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

export type CopyFilesResult = { ok: true; copiedPaths: string[] } | { ok: false; error: string };

export type ResolveRealPathResult = {
  path: string;
};

export type WriteFileBase64Input = {
  /** Absolute path of the file to write. */
  absolutePath: string;
  /** Base64-encoded file content. */
  contentBase64: string;
};

export type WriteFileBase64Result = { ok: true } | { ok: false; error: string };

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
  resolveRealPath: (path: string) => Promise<ResolveRealPathResult>;
  copyFiles: (input: CopyFilesInput) => Promise<CopyFilesResult>;
  writeFileBase64: (input: WriteFileBase64Input) => Promise<WriteFileBase64Result>;
  loadBrowserHistory: () => Promise<LoadBrowserHistoryResult>;
  appendBrowserHistory: (input: AppendBrowserHistoryInput) => Promise<{ ok: true }>;
  dispatchNotification: (input: DispatchNotificationInput) => Promise<NotificationDispatchResult>;
  playNotificationSound: (input: PlayNotificationSoundInput) => Promise<NotificationSoundPreviewResult>;
  requestMicrophoneAccess: () => Promise<{ granted: boolean }>;
  getPendingUpdate: () => Promise<DesktopUpdateEventPayload | null>;
  dismissUpdate: () => Promise<{ ok: true }>;
  checkForUpdates: () => Promise<{ ok: true }>;
  downloadUpdate: () => Promise<{ ok: true } | { ok: false; error: string }>;
  installUpdate: () => Promise<{ ok: true }>;
  getAuthStatus: () => Promise<AuthStatusResult>;
  login: () => Promise<AuthLoginResult>;
  getPiProviderConfigSnapshot: () => Promise<PiProviderConfigSnapshotResult>;
  authenticatePiProvider: (input: AuthenticatePiProviderInput) => Promise<PiProviderConfigMutationResult>;
  cancelPiProviderAuthentication: (providerId: string) => Promise<PiProviderConfigResult<boolean>>;
  respondPiAuthPrompt: (input: PiAuthPromptResponseInput) => Promise<PiProviderConfigResult<true>>;
  removePiProviderCredential: (providerId: string) => Promise<PiProviderConfigMutationResult>;
  getDaemonInfo: () => Promise<DaemonInfoResult>;
  restartDaemon: () => Promise<DaemonRestartResult>;
  readDaemonLog: () => Promise<DaemonLogResult>;
  getDaemonQuitOnExit: () => Promise<boolean>;
  setDaemonQuitOnExit: (value: boolean) => Promise<{ ok: true }>;
  getDesktopCliInstallStatus: () => Promise<DesktopCliInstallStatusResult>;
  installDesktopCli: () => Promise<DesktopCliInstallResult>;
  uninstallDesktopCli: () => Promise<DesktopCliInstallResult>;
  writeClipboardText: (text: string) => Promise<{ ok: true }>;
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
  resolveRealPath: "desktop:host/resolve-real-path",
  copyFiles: "desktop:host/copy-files",
  writeFileBase64: "desktop:host/write-file-base64",
  loadBrowserHistory: "desktop:host/load-browser-history",
  appendBrowserHistory: "desktop:host/append-browser-history",
  dispatchNotification: "desktop:host/dispatch-notification",
  playNotificationSound: "desktop:host/play-notification-sound",
  requestMicrophoneAccess: "desktop:host/request-microphone-access",
  getPendingUpdate: "desktop:host/get-pending-update",
  dismissUpdate: "desktop:host/dismiss-update",
  checkForUpdates: "desktop:host/check-for-updates",
  downloadUpdate: "desktop:host/download-update",
  installUpdate: "desktop:host/install-update",
  getAuthStatus: "desktop:host/get-auth-status",
  login: "desktop:host/login",
  getPiProviderConfigSnapshot: "desktop:host/get-pi-runtime-snapshot",
  authenticatePiProvider: "desktop:host/authenticate-pi-provider",
  cancelPiProviderAuthentication: "desktop:host/cancel-pi-provider-authentication",
  respondPiAuthPrompt: "desktop:host/respond-pi-auth-prompt",
  removePiProviderCredential: "desktop:host/remove-pi-provider-credential",
  getDaemonInfo: "desktop:host/get-daemon-info",
  restartDaemon: "desktop:host/restart-daemon",
  readDaemonLog: "desktop:host/read-daemon-log",
  getDaemonQuitOnExit: "desktop:host/get-daemon-quit-on-exit",
  setDaemonQuitOnExit: "desktop:host/set-daemon-quit-on-exit",
  getDesktopCliInstallStatus: "desktop:host/get-desktop-cli-install-status",
  installDesktopCli: "desktop:host/install-desktop-cli",
  uninstallDesktopCli: "desktop:host/uninstall-desktop-cli",
  writeClipboardText: "desktop:host/write-clipboard-text",
} as const;
