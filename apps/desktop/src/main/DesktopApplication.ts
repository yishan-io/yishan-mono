import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import type { AppActionPayload } from "../shared/contracts/actions";
import { configureApplicationMenu } from "./app/menu";
import { getAuthStatus, getAuthTokens, login } from "./auth/cliAuth";
import { DaemonManager } from "./daemon/daemonManager";
import { launchPath, openExternalUrl } from "./integrations/externalAppLauncher";
import { readExternalClipboardSourcePathsFromSystem } from "./integrations/externalClipboardPipeline";
import { DESKTOP_RPC_IPC_CHANNELS, type DesktopUpdateEventPayload, HOST_IPC_CHANNELS } from "./ipc";
import { createDesktopNotificationHostAdapter } from "./notifications/service";
import { isDevMode } from "./runtime/environment";
import { startAutoUpdates } from "./updates/autoUpdateService";

type DispatchActionOptions = {
  focusApp?: boolean;
};

/**
 * Owns Electron desktop lifecycle and main window bootstrap.
 */
export class DesktopApplication {
  private mainWindow: BrowserWindow | null = null;
  private readonly daemonManager = new DaemonManager();
  private hasProcessedBeforeQuit = false;
  private pendingUpdateReady: DesktopUpdateEventPayload | null = null;

  /**
   * Starts the desktop app and exits on startup failure.
   */
  static run() {
    const desktopApplication = new DesktopApplication();

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
    await this.daemonManager.ensureStarted();
    this.registerHostIpcHandlers();
    this.registerAuthIpcHandlers();
    this.createMainWindow();
    configureApplicationMenu({
      devMode: isDevMode(),
      dispatchAction: (payload, options) => {
        this.dispatchAction(payload, options);
      },
    });
    startAutoUpdates({
      app,
      notifyUpdateReady: (payload) => {
        this.dispatchUpdateReady(payload);
      },
    });

    if (isDevMode()) {
      app.on("before-quit", (event) => {
        if (this.hasProcessedBeforeQuit) {
          return;
        }

        event.preventDefault();
        this.hasProcessedBeforeQuit = true;
        void this.daemonManager
          .stop()
          .catch((error: unknown) => {
            console.warn("Failed to stop daemon service during desktop shutdown", error);
          })
          .finally(() => {
            app.quit();
          });
      });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  }

  /** Registers desktop auth IPC endpoints backed by the bundled CLI login/status commands. */
  private registerAuthIpcHandlers() {
    ipcMain.handle(HOST_IPC_CHANNELS.getAuthStatus, async () => {
      return await getAuthStatus();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.login, async () => {
      return await login();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getAuthTokens, async () => {
      return await getAuthTokens();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getDaemonInfo, async () => {
      return await this.daemonManager.getInfo();
    });
  }

  /** Registers desktop host IPC endpoints used by renderer shell/runtime commands. */
  private registerHostIpcHandlers() {
    const notificationAdapter = createDesktopNotificationHostAdapter();

    ipcMain.handle(HOST_IPC_CHANNELS.openLocalFolderDialog, async (_event, input) => {
      const options: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
        defaultPath: input?.startingFolder?.trim() || undefined,
      };
      const result = this.mainWindow
        ? await dialog.showOpenDialog(this.mainWindow, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled) {
        return null;
      }

      return result.filePaths[0] ?? null;
    });

    ipcMain.handle(HOST_IPC_CHANNELS.toggleMainWindowMaximized, async () => {
      const window = this.mainWindow;
      if (!window) {
        return { ok: true };
      }

      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }

      return { ok: true };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getMainWindowFullscreenState, async () => {
      return {
        isFullscreen: this.mainWindow?.isFullScreen() ?? false,
      };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.openEntryInExternalApp, async (_event, input) => {
      const absolutePath = resolve(input.workspaceWorktreePath, input.relativePath ?? ".");
      if (input.appId === "system-file-manager") {
        let isDirectory = true;
        try {
          isDirectory = statSync(absolutePath).isDirectory();
        } catch {
          isDirectory = true;
        }

        await launchPath({
          kind: "system-file-manager",
          path: absolutePath,
          isDirectory,
        });
      } else {
        await launchPath({
          kind: "external-app",
          path: absolutePath,
          appId: input.appId,
        });
      }

      return { ok: true };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.openExternalUrl, async (_event, input) => {
      return await openExternalUrl(input.url);
    });

    ipcMain.handle(HOST_IPC_CHANNELS.readExternalClipboardSourcePaths, async () => {
      return await readExternalClipboardSourcePathsFromSystem();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.dispatchNotification, async (_event, input) => {
      const notificationResult = await notificationAdapter.driver.show({
        title: input.title,
        body: input.body,
      });

      return {
        sent: true,
        notificationId: notificationResult?.notificationId,
      };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.playNotificationSound, async (_event, input) => {
      await notificationAdapter.playSound({
        eventType: "run-finished",
        soundId: input.soundId,
        volume: input.volume,
      });

      return {
        played: true,
      };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getPendingUpdate, async () => {
      return this.pendingUpdateReady;
    });

    ipcMain.handle(HOST_IPC_CHANNELS.installUpdate, async () => {
      autoUpdater.quitAndInstall();
      return { ok: true };
    });
  }

  /** Focuses the main window when menu actions should bring the app forward. */
  private focusMainWindow(): void {
    this.mainWindow?.show();
    this.mainWindow?.focus();
  }

  /** Forwards one native menu action to renderer listeners. */
  private dispatchAction(payload: AppActionPayload, options?: DispatchActionOptions): void {
    this.mainWindow?.webContents.send(DESKTOP_RPC_IPC_CHANNELS.event, {
      method: "appAction",
      payload,
    });

    if (options?.focusApp) {
      this.focusMainWindow();
    }
  }

  /** Forwards a downloaded app update event to renderer update prompts. */
  private dispatchUpdateReady(payload: DesktopUpdateEventPayload): void {
    this.pendingUpdateReady = payload;
    this.mainWindow?.webContents.send(DESKTOP_RPC_IPC_CHANNELS.event, {
      method: "desktopUpdateReady",
      payload,
    });
  }

  /**
   * Creates and initializes the main BrowserWindow instance.
   */
  private createMainWindow() {
    const mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      titleBarStyle: "hiddenInset",
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const rendererUrl = process.env.ELECTRON_RENDERER_URL;

    if (rendererUrl) {
      void mainWindow.loadURL(rendererUrl);
      mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
      void mainWindow.loadFile(join(__dirname, "..", "renderer", "index.html"));
    }

    this.mainWindow = mainWindow;
  }
}
