import type { DesktopEventEnvelope } from "../../shared/contracts/desktopEventEnvelope";
import type { AuthLoginResult, AuthStatusResult } from "./auth";
import type { AppendBrowserHistoryInput, LoadBrowserHistoryResult } from "./browser";
import type { DaemonInfoResult, DaemonLogResult, DaemonLogSource, DaemonRestartResult } from "./daemon";
import type {
  CopyFilesInput,
  CopyFilesResult,
  ExternalAppId,
  ExternalClipboardReadOutcome,
  OpenEntryInExternalAppInput,
  OpenExternalUrlInput,
  OpenExternalUrlResult,
  ResolveRealPathResult,
  WriteFileBase64Input,
  WriteFileBase64Result,
} from "./files";
import type {
  DispatchNotificationInput,
  NotificationDispatchResult,
  NotificationSoundPreviewResult,
  PlayNotificationSoundInput,
} from "./notifications";
import type { DesktopUpdateEventPayload } from "./updates";
import type { MainWindowFullscreenState, OpenLocalFolderDialogInput } from "./window";

export type DesktopHostBridge = {
  getDesktopAppVersion: () => Promise<string>;
  openLocalFolderDialog: (input?: OpenLocalFolderDialogInput) => Promise<string | null>;
  toggleMainWindowMaximized: () => Promise<{ ok: true }>;
  getMainWindowFullscreenState: () => Promise<MainWindowFullscreenState>;
  openEntryInExternalApp: (input: OpenEntryInExternalAppInput) => Promise<{ ok: true }>;
  listDetectedExternalAppIds: () => Promise<ExternalAppId[]>;
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
  getDaemonInfo: () => Promise<DaemonInfoResult>;
  restartDaemon: () => Promise<DaemonRestartResult>;
  readDaemonLog: (source: DaemonLogSource) => Promise<DaemonLogResult>;
  getDaemonQuitOnExit: () => Promise<boolean>;
  setDaemonQuitOnExit: (value: boolean) => Promise<{ ok: true }>;
  writeClipboardText: (text: string) => Promise<{ ok: true }>;
};

export type DesktopRpcEventBridge = {
  subscribe: (listener: (envelope: DesktopEventEnvelope) => void) => () => void;
};

export type DesktopBridge = {
  host: DesktopHostBridge;
  events: DesktopRpcEventBridge;
};

export type { AuthLoginResult, AuthStatusResult } from "./auth";
export type { DesktopUpdateEventPayload } from "./updates";
export type {
  AppendBrowserHistoryInput,
  BrowserHistoryEntry,
  BrowserHistoryGroup,
  LoadBrowserHistoryResult,
} from "./browser";
export type { DaemonInfoResult, DaemonLogResult, DaemonLogSource, DaemonRestartResult } from "./daemon";
export type {
  CopyFilesInput,
  CopyFilesResult,
  ExternalAppId,
  ExternalClipboardReadOutcome,
  OpenEntryInExternalAppInput,
  OpenExternalUrlInput,
  OpenExternalUrlResult,
  ResolveRealPathResult,
  WriteFileBase64Input,
  WriteFileBase64Result,
} from "./files";
export type {
  DispatchNotificationInput,
  NotificationDispatchResult,
  NotificationSoundPreviewResult,
  PlayNotificationSoundInput,
} from "./notifications";
export type { MainWindowFullscreenState, OpenLocalFolderDialogInput } from "./window";
