import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAuthStatus, login } from "./auth/cliAuth";
import { readExternalClipboardSourcePathsFromSystem } from "./integrations/externalClipboardPipeline";
import { launchPath, openExternalUrl } from "./integrations/externalAppLauncher";
import { HOST_IPC_CHANNELS } from "./ipc";
import { createDesktopNotificationHostAdapter } from "./notifications/service";

/**
 * Owns Electron desktop lifecycle and main window bootstrap.
 */
export class DesktopApplication {
  private mainWindow: BrowserWindow | null = null;

  /**
   * Starts the desktop app and exits on startup failure.
   */
  static run() {
    const desktopApplication = new DesktopApplication();

    desktopApplication.start().catch((error: unknown) => {
      console.error("Failed to start desktop application", error);
      app.exit(1);
    });
  }

  /**
   * Binds Electron lifecycle hooks and creates the initial window.
   */
  private async start(): Promise<void> {
    await app.whenReady();
    this.registerHostIpcHandlers();
    this.registerAuthIpcHandlers();
    this.createMainWindow();

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
