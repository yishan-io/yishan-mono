import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { wireAppLifecycle } from "./lifecycle/appLifecycle";
import { registerWorkspaceFileProtocol } from "./protocol/workspaceFileProtocol";
import { registerPermissionPolicy } from "./security/permissionPolicy";
import { UpdateRuntime } from "./updates/updateRuntime";
import { MainWindow } from "./window/mainWindow";
export { isPermissionAllowed } from "./security/permissionPolicy";
import { net, BrowserWindow, Menu, app, dialog, ipcMain, protocol, session } from "electron";
import { autoUpdater } from "electron-updater";
import { ACTIONS, type AppActionPayload } from "../shared/contracts/actions";
import { getErrorMessage } from "../shared/errors/getErrorMessage";
import { configureApplicationMenu } from "./app/menu";
import { getAuthStatus, login } from "./auth/cliAuth";
import { flushBrowserHistoryPruneCheck } from "./browser/browserHistory";
import { resolveDaemonLogFilePath } from "./daemon/daemonHealthCheck";
import { DaemonManager } from "./daemon/daemonManager";
import { getDaemonQuitOnExit, setDaemonQuitOnExit } from "./daemon/daemonSettings";
import { DESKTOP_RPC_IPC_CHANNELS, type DesktopUpdateEventPayload, HOST_IPC_CHANNELS } from "./ipc";
import { registerFileIpcHandlers } from "./ipc/fileHandlers";
import { registerNotificationAndBrowserIpcHandlers } from "./ipc/notificationAndBrowserHandlers";
import { isDevMode } from "./runtime/environment";

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
    sendEvent: (payload) => this.mainWindow.browserWindow?.webContents.send(DESKTOP_RPC_IPC_CHANNELS.event, payload),
    focusApp: () => this.focusMainWindow(),
  });
  private readonly daemonManager = new DaemonManager();
  private isQuitting = false;
  private pendingProtocolUrl: string | null = null;
  private cachedDaemonQuitOnExit: boolean | null = null;

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
      this.cachedDaemonQuitOnExit = await getDaemonQuitOnExit();
    } catch (error: unknown) {
      console.warn("Failed to load daemon quit-on-exit setting:", error);
      this.cachedDaemonQuitOnExit = false;
    }

    await this.daemonManager.ensureStarted();
    this.registerHostIpcHandlers();
    this.registerAuthIpcHandlers();
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

  /**
   * Stops and restarts the local daemon so it re-resolves the account data
   * dir. A running daemon keeps its boot-time account handles, so an account
   * switch (login/logout token sync) requires a restart to take effect. Stop
   * failures are logged and tolerated; start failures are surfaced to the
   * caller (auth itself already succeeded and is not rolled back).
   */
  private async restartDaemonForAccountSwitch(): Promise<void> {
    try {
      await this.daemonManager.stop();
    } catch (error: unknown) {
      console.warn("Daemon stop during account switch:", getErrorMessage(error));
    }

    await this.daemonManager.ensureStarted();
  }

  /** Registers desktop auth IPC endpoints backed by the bundled CLI login/status commands. */
  private registerAuthIpcHandlers() {
    ipcMain.handle(HOST_IPC_CHANNELS.getDesktopAppVersion, async () => {
      return app.getVersion();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getAuthStatus, async () => {
      return await getAuthStatus();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.login, async () => {
      const result = await login();
      // A successful, non-skipped login switched the active account. Restart
      // the daemon so it re-resolves the account data dir — a running daemon
      // keeps its boot-time account handles until restart. Restart failures
      // are logged but never fail the login response (auth already succeeded).
      if (result.authenticated && !result.skipped) {
        try {
          await this.restartDaemonForAccountSwitch();
        } catch (error: unknown) {
          console.warn("Daemon restart after login failed:", getErrorMessage(error));
        }
      }
      return result;
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getDaemonInfo, async () => {
      return await this.daemonManager.getInfo();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.restartDaemon, async () => {
      try {
        await this.restartDaemonForAccountSwitch();
        const info = await this.daemonManager.getInfo();
        return { success: true as const, daemonInfo: info };
      } catch (error: unknown) {
        const reason = getErrorMessage(error);
        return { success: false as const, error: reason };
      }
    });

    ipcMain.handle(HOST_IPC_CHANNELS.readDaemonLog, async () => {
      try {
        const logFilePath = resolveDaemonLogFilePath();
        const content = await readFile(logFilePath, "utf8");
        return { ok: true as const, content };
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          return { ok: true as const, content: "" };
        }
        const reason = error instanceof Error ? error.message : "Failed to read daemon log file";
        return { ok: false as const, error: reason };
      }
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getDaemonQuitOnExit, async () => {
      try {
        if (this.cachedDaemonQuitOnExit === null) {
          this.cachedDaemonQuitOnExit = await getDaemonQuitOnExit();
        }
        return this.cachedDaemonQuitOnExit;
      } catch (error: unknown) {
        console.warn("Failed to read daemon quit-on-exit setting:", error);
        return false;
      }
    });

    ipcMain.handle(HOST_IPC_CHANNELS.setDaemonQuitOnExit, async (_event, value: boolean) => {
      await setDaemonQuitOnExit(value);
      this.cachedDaemonQuitOnExit = value;
      return { ok: true as const };
    });
  }

  /** Registers desktop host IPC endpoints used by renderer shell/runtime commands. */
  private registerHostIpcHandlers() {
    registerFileIpcHandlers();
    registerNotificationAndBrowserIpcHandlers();

    ipcMain.handle(HOST_IPC_CHANNELS.openLocalFolderDialog, async (_event, input) => {
      const options: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
        defaultPath: input?.startingFolder?.trim() || undefined,
      };
      const window = this.mainWindow.browserWindow;
      const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);

      if (result.canceled) {
        return null;
      }

      return result.filePaths[0] ?? null;
    });

    ipcMain.handle(HOST_IPC_CHANNELS.toggleMainWindowMaximized, async () => {
      this.mainWindow.toggleMaximized();
      return { ok: true };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getMainWindowFullscreenState, async () => {
      return {
        isFullscreen: this.mainWindow.isFullscreen(),
      };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getPendingUpdate, async () => {
      return this.updateRuntime.getPendingUpdate();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.dismissUpdate, async () => {
      await this.updateRuntime.dismissUpdate();
      return { ok: true as const };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.checkForUpdates, async () => {
      await this.updateRuntime.handleManualUpdateCheck();
      return { ok: true as const };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.downloadUpdate, async () => {
      return this.updateRuntime.download();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.installUpdate, async () => {
      // Mark quit intent before electron-updater closes windows so the
      // macOS close handler does not convert update restart into a hide.
      this.isQuitting = true;
      await this.runBeforeQuitCleanup();
      autoUpdater.quitAndInstall(false, true);
      return { ok: true as const };
    });
  }

  private async runBeforeQuitCleanup(): Promise<void> {
    try {
      await flushBrowserHistoryPruneCheck();
    } catch (error: unknown) {
      console.warn("Failed to prune browser history during desktop shutdown", error);
    }

    const shouldStopDaemon = isDevMode() || (this.cachedDaemonQuitOnExit ?? false);
    if (!shouldStopDaemon) {
      return;
    }

    try {
      await this.daemonManager.stop();
    } catch (error: unknown) {
      console.warn("Failed to stop daemon service during desktop shutdown", error);
    }
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
    this.mainWindow.browserWindow?.webContents.send(DESKTOP_RPC_IPC_CHANNELS.event, {
      method: "appAction",
      payload,
    });

    if (options?.focusApp) {
      this.focusMainWindow();
    }
  }
}
