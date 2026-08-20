import { wireAppLifecycle } from "./lifecycle/appLifecycle";
import { prepareForRestart } from "./lifecycle/restartPreparation";
import { registerWorkspaceFileProtocol } from "./protocol/workspaceFileProtocol";
import { registerPermissionPolicy } from "./security/permissionPolicy";
import { UpdateRuntime } from "./updates/updateRuntime";
import { MainWindow } from "./window/mainWindow";
export { isPermissionAllowed } from "./security/permissionPolicy";
import { resolve } from "node:path";
import { app, dialog, session } from "electron";
import type { AppActionPayload } from "../shared/contracts/actions";
import { getErrorMessage } from "../shared/errors/getErrorMessage";
import { getDesktopAppVersion } from "./app/desktopAppInfo";
import { configureApplicationMenu } from "./app/menu";
import { loginAndRestartDaemon } from "./auth/accountSwitch";
import { getAuthStatus } from "./auth/cliAuth";
import { desktopHostEventChannels } from "./bridge/channels";
import { registerDesktopHostIpc } from "./bridge/registerDesktopHostIpc";
import {
  appendBrowserHistoryEntry,
  flushBrowserHistoryPruneCheck,
  loadBrowserHistoryGroups,
} from "./browser/browserHistory";
import { writeClipboardText } from "./clipboard/clipboardText";
import { readExternalClipboardSourcePathsFromSystem } from "./clipboard/externalFileClipboardReader";
import { getDaemonQuitOnExit, setDaemonQuitOnExit } from "./daemon/daemonExitPreference";
import { DaemonHost } from "./daemon/daemonHost";
import { DaemonManager } from "./daemon/daemonManager";
import { listDetectedExternalAppIds } from "./external-app/externalAppLauncher";
import { openExternalUrl } from "./external-app/externalUrlLauncher";
import { openWorkspaceEntry } from "./external-app/workspaceEntryLauncher";
import { copyFiles, resolveRealPath, writeFileBase64 } from "./files/fileSystemOperations";
import { createNotificationHost } from "./notifications/notificationHost";
import { isDevMode } from "./runtime/environment";
import { pickLocalFolder } from "./window/folderPicker";

type DispatchActionOptions = {
  focusApp?: boolean;
};

/**
 * Owns Electron desktop lifecycle and main window bootstrap.
 */
export class DesktopApplication {
  private readonly mainWindow = new MainWindow({
    shouldAllowClose: () => this.isQuitting,
    onClosed: () => {},
  });
  private readonly updateRuntime = new UpdateRuntime(app, {
    sendEvent: (payload) => this.mainWindow.browserWindow?.webContents.send(desktopHostEventChannels.event, payload),
    focusApp: () => this.focusMainWindow(),
    prepareForRestart: () => this.prepareForRestart(),
  });
  private readonly daemonManager = new DaemonManager();
  private readonly daemonHost = new DaemonHost(this.daemonManager, getDaemonQuitOnExit, setDaemonQuitOnExit);
  private readonly notificationHost = createNotificationHost();
  private isQuitting = false;
  private pendingProtocolUrl: string | null = null;

  /**
   * Starts the desktop app and exits on startup failure.
   */
  static run() {
    const desktopApplication = new DesktopApplication();

    const gotSingleInstanceLock = app.requestSingleInstanceLock();
    if (!gotSingleInstanceLock) {
      app.quit();
      return;
    }

    desktopApplication.pendingProtocolUrl = desktopApplication.extractAuthCallbackUrlFromArgv(process.argv);

    app.on("second-instance", (_event, argv) => {
      const callbackUrl = desktopApplication.extractAuthCallbackUrlFromArgv(argv);
      if (callbackUrl) {
        desktopApplication.handleProtocolCallbackUrl(callbackUrl);
      }
    });

    desktopApplication.start().catch(async (error: unknown) => {
      console.error("Failed to start desktop application", error);
      try {
        await desktopApplication.daemonManager.stop();
      } catch (stopError) {
        console.warn("Failed to stop daemon service after startup failure", stopError);
      } finally {
        app.exit(1);
      }
    });
  }

  /**
   * Binds Electron lifecycle hooks and creates the initial window.
   */
  private async start(): Promise<void> {
    await app.whenReady();
    registerWorkspaceFileProtocol();
    registerPermissionPolicy(
      session.defaultSession,
      (webContentsId) => webContentsId === this.mainWindow.webContentsId,
    );

    const defaultAppEntry = process.argv[1];
    if (process.defaultApp && defaultAppEntry) {
      app.setAsDefaultProtocolClient("yishan", process.execPath, [resolve(defaultAppEntry)]);
    } else {
      app.setAsDefaultProtocolClient("yishan");
    }

    // Override the runtime app name so native menus, About dialog, and
    // other OS-level surfaces show "Yishan" instead of the scoped
    // package name "@yishan-io/desktop".
    app.setName("Yishan");

    // Pre-load daemon settings so before-quit has the correct value even
    // when the user never opens the Settings view during this session.
    try {
      this.daemonHost.setCachedQuitOnExit(await getDaemonQuitOnExit());
    } catch (error: unknown) {
      console.warn("Failed to load daemon quit-on-exit setting:", error);
      this.daemonHost.setCachedQuitOnExit(false);
    }

    await this.daemonManager.ensureStarted();
    this.registerDesktopHostIpc();
    this.mainWindow.create();
    this.mainWindow.loadRenderer();
    configureApplicationMenu({
      appName: "Yishan",
      devMode: isDevMode(),
      dispatchAction: (payload, options) => {
        this.dispatchAction(payload, options);
      },
      checkForUpdates: () => {
        void this.updateRuntime.handleManualUpdateCheck();
      },
    });
    this.updateRuntime.startAutoUpdates();

    wireAppLifecycle(app, {
      confirmQuit: () => this.confirmQuit(),
      runBeforeQuitCleanup: () => this.runBeforeQuitCleanup(),
      onProtocolUrl: (callbackUrl) => this.handleProtocolCallbackUrl(callbackUrl),
      onActivate: () => {
        if (this.mainWindow.browserWindow && !this.mainWindow.browserWindow.isDestroyed()) {
          this.mainWindow.focus();
        } else {
          this.mainWindow.create();
          this.mainWindow.loadRenderer();
        }
      },
      isQuitting: () => this.isQuitting,
      setQuitting: (quitting) => {
        this.isQuitting = quitting;
      },
      takePendingProtocolUrl: () => {
        const callbackUrl = this.pendingProtocolUrl;
        this.pendingProtocolUrl = null;
        return callbackUrl;
      },
    });
  }

  private extractAuthCallbackUrlFromArgv(argv: string[]): string | null {
    for (const argument of argv) {
      if (argument.startsWith("yishan://auth/callback")) {
        return argument;
      }
    }

    return null;
  }

  private handleProtocolCallbackUrl(callbackUrl: string): void {
    if (!callbackUrl.startsWith("yishan://auth/callback")) {
      return;
    }

    this.focusMainWindow();
  }

  private registerDesktopHostIpc(): void {
    registerDesktopHostIpc({
      app: { getVersion: getDesktopAppVersion },
      auth: {
        getStatus: getAuthStatus,
        login: () => loginAndRestartDaemon(() => this.daemonHost.restartForAccountSwitch()),
      },
      daemon: this.daemonHost,
      window: {
        pickFolder: (input) => pickLocalFolder(this.mainWindow.browserWindow, input),
        toggleMaximized: () => this.mainWindow.toggleMaximized(),
        isFullscreen: () => this.mainWindow.isFullscreen(),
      },
      updates: this.updateRuntime,
      browser: { load: loadBrowserHistoryGroups, append: appendBrowserHistoryEntry },
      notifications: this.notificationHost,
      fileSystem: { resolveRealPath, copyFiles, writeFileBase64 },
      externalApp: {
        openEntry: openWorkspaceEntry,
        list: listDetectedExternalAppIds,
        openUrl: ({ url }) => openExternalUrl(url),
      },
      clipboard: { readExternalFiles: readExternalClipboardSourcePathsFromSystem, writeText: writeClipboardText },
    });
  }

  private async runBeforeQuitCleanup(): Promise<void> {
    await this.prepareForRestart(false);
  }

  private async prepareForRestart(markQuitIntent = true): Promise<void> {
    await prepareForRestart({
      markQuitting: () => {
        if (markQuitIntent) this.isQuitting = true;
      },
      flushHistory: flushBrowserHistoryPruneCheck,
      shouldStopDaemon: () => isDevMode() || this.daemonHost.shouldStopOnExit(),
      stopDaemon: () => this.daemonManager.stop(),
    });
  }

  private async confirmQuit(): Promise<boolean> {
    const messageBoxOptions: Electron.MessageBoxOptions = {
      type: "question",
      buttons: ["Cancel", "Quit"],
      defaultId: 0,
      cancelId: 0,
      title: "Quit Yishan?",
      message: "Are you sure you want to quit Yishan?",
      noLink: true,
    };

    const window = this.mainWindow.browserWindow;
    const result = window
      ? await dialog.showMessageBox(window, messageBoxOptions)
      : await dialog.showMessageBox(messageBoxOptions);

    return result.response === 1;
  }

  /** Focuses the main window when menu actions should bring the app forward. */
  private focusMainWindow(): void {
    this.mainWindow.focus();
  }

  /** Forwards one native menu action to renderer listeners. */
  private dispatchAction(payload: AppActionPayload, options?: DispatchActionOptions): void {
    this.mainWindow.browserWindow?.webContents.send(desktopHostEventChannels.event, {
      method: "appAction",
      payload,
    });

    if (options?.focusApp) {
      this.focusMainWindow();
    }
  }
}
