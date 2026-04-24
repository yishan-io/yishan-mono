import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAuthStatus, getAuthTokens, login } from "./auth/cliAuth";
import { DaemonManager } from "./daemon/daemonManager";
import { DaemonJsonRpcClient } from "./daemon/jsonRpcClient";
import { readExternalClipboardSourcePathsFromSystem } from "./integrations/externalClipboardPipeline";
import { launchPath, openExternalUrl } from "./integrations/externalAppLauncher";
import { API_RPC_IPC_CHANNELS, DESKTOP_RPC_IPC_CHANNELS, HOST_IPC_CHANNELS } from "./ipc";
import { createDesktopNotificationHostAdapter } from "./notifications/service";
import { isDevMode } from "./runtime/environment";

/**
 * Owns Electron desktop lifecycle and main window bootstrap.
 */
export class DesktopApplication {
  private mainWindow: BrowserWindow | null = null;
  private readonly daemonManager = new DaemonManager();
  private readonly daemonJsonRpcClient = new DaemonJsonRpcClient();
  private readonly apiSubscriptionsByWebContentsId = new Map<number, Set<string>>();
  private readonly apiCleanupHookRegisteredWebContentsIds = new Set<number>();
  private hasProcessedBeforeQuit = false;

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
    await this.daemonManager.ensureStarted();
    this.registerHostIpcHandlers();
    this.registerAuthIpcHandlers();
    this.registerApiIpcHandlers();
    this.createMainWindow();

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
            this.daemonJsonRpcClient.dispose();
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
        this.daemonJsonRpcClient.dispose();
        app.quit();
      }
    });
  }

  private formatSubscriptionEventData(method: string, payload: unknown): unknown {
    if (method === "workspace.terminal.output" && payload && typeof payload === "object") {
      return {
        type: "output",
        ...(payload as Record<string, unknown>),
      };
    }

    if (method === "workspace.terminal.exit" && payload && typeof payload === "object") {
      return {
        type: "exit",
        ...(payload as Record<string, unknown>),
      };
    }

    return payload;
  }

  private stopAllApiSubscriptionsForWebContents(webContentsId: number): void {
    const subscriptionIds = this.apiSubscriptionsByWebContentsId.get(webContentsId);
    if (!subscriptionIds) {
      return;
    }

    for (const subscriptionId of subscriptionIds) {
      this.daemonJsonRpcClient.stopSubscription(subscriptionId);
    }

    this.apiSubscriptionsByWebContentsId.delete(webContentsId);
  }

  private registerApiIpcHandlers() {
    ipcMain.handle(API_RPC_IPC_CHANNELS.invokeProcedure, async (_event, input) => {
      return await this.daemonJsonRpcClient.invoke(input.path, input.input);
    });

    ipcMain.handle(API_RPC_IPC_CHANNELS.startSubscription, async (event, input) => {
      const webContentsId = event.sender.id;
      const subscriptionId = await this.daemonJsonRpcClient.startSubscription({
        method: input.path,
        params: input.input,
        onNotification: (notification) => {
          if (event.sender.isDestroyed()) {
            return;
          }

          event.sender.send(DESKTOP_RPC_IPC_CHANNELS.event, {
            method: "apiRpc.subscription",
            payload: {
              subscriptionId,
              data: this.formatSubscriptionEventData(notification.method, notification.payload),
            },
          });

          event.sender.send(DESKTOP_RPC_IPC_CHANNELS.event, {
            method: notification.method,
            payload: notification.payload,
          });
        },
      });

      const subscriptionIds = this.apiSubscriptionsByWebContentsId.get(webContentsId) ?? new Set<string>();
      subscriptionIds.add(subscriptionId);
      this.apiSubscriptionsByWebContentsId.set(webContentsId, subscriptionIds);

      if (!this.apiCleanupHookRegisteredWebContentsIds.has(webContentsId)) {
        this.apiCleanupHookRegisteredWebContentsIds.add(webContentsId);
        event.sender.once("destroyed", () => {
          this.stopAllApiSubscriptionsForWebContents(webContentsId);
          this.apiCleanupHookRegisteredWebContentsIds.delete(webContentsId);
        });
      }

      return { subscriptionId };
    });

    ipcMain.handle(API_RPC_IPC_CHANNELS.stopSubscription, async (event, input) => {
      const webContentsId = event.sender.id;
      this.daemonJsonRpcClient.stopSubscription(input.subscriptionId);
      const subscriptionIds = this.apiSubscriptionsByWebContentsId.get(webContentsId);
      subscriptionIds?.delete(input.subscriptionId);
      if (subscriptionIds && subscriptionIds.size === 0) {
        this.apiSubscriptionsByWebContentsId.delete(webContentsId);
      }
      return { stopped: true };
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
