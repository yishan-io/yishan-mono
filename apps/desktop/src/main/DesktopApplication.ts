import { statSync } from "node:fs";
import {
  copyFile as copyFileAsync,
  cp as cpAsync,
  mkdir as mkdirAsync,
  stat as statAsync,
  writeFile as writeFileAsync,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, Menu, app, dialog, ipcMain, net, protocol } from "electron";
import { autoUpdater } from "electron-updater";
import { ACTIONS, type AppActionPayload } from "../shared/contracts/actions";
import {
  appendBrowserHistoryEntry,
  flushBrowserHistoryPruneCheck,
  loadBrowserHistoryGroups,
} from "./browser/browserHistory";
import { configureApplicationMenu } from "./app/menu";
import { getAuthStatus, login } from "./auth/cliAuth";
import { DaemonManager } from "./daemon/daemonManager";
import { getDaemonQuitOnExit, setDaemonQuitOnExit } from "./daemon/daemonSettings";
import { createDaemonJwt, ensureDaemonJwtSecret } from "./daemon/daemonSecret";
import { launchPath, openExternalUrl } from "./integrations/externalAppLauncher";
import { readExternalClipboardSourcePathsFromSystem } from "./integrations/externalClipboardPipeline";
import { DESKTOP_RPC_IPC_CHANNELS, type DesktopUpdateEventPayload, HOST_IPC_CHANNELS } from "./ipc";
import { createDesktopNotificationHostAdapter } from "./notifications/service";
import { isDevMode } from "./runtime/environment";
import { checkForUpdatesManually, downloadUpdate, startAutoUpdates } from "./updates/autoUpdateService";

type DispatchActionOptions = {
  focusApp?: boolean;
};

const WORKSPACE_FILE_PROTOCOL = "yishan-file";
const WORKSPACE_FILE_PROTOCOL_HOST = "workspace-image";

function isPathWithinOrEqual(rootPath: string, candidatePath: string): boolean {
  const normalizedRootPath = resolve(rootPath);
  const normalizedCandidatePath = resolve(candidatePath);
  return (
    normalizedCandidatePath === normalizedRootPath || normalizedCandidatePath.startsWith(`${normalizedRootPath}/`)
  );
}

/**
 * Owns Electron desktop lifecycle and main window bootstrap.
 */
export class DesktopApplication {
  private mainWindow: BrowserWindow | null = null;
  private readonly daemonManager = new DaemonManager();
  private hasProcessedBeforeQuit = false;
  private isQuitting = false;
  private pendingProtocolUrl: string | null = null;
  private pendingUpdateReady: DesktopUpdateEventPayload | null = null;
  private cachedDaemonQuitOnExit: boolean | null = null;
  private daemonJwtSecret: string | null = null;

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
    this.registerWorkspaceFileProtocol();

    const defaultAppEntry = process.argv[1];
    if (process.defaultApp && defaultAppEntry) {
      app.setAsDefaultProtocolClient("yishan", process.execPath, [resolve(defaultAppEntry)]);
    } else {
      app.setAsDefaultProtocolClient("yishan");
    }

    // Override the runtime app name so native menus, About dialog, and
    // other OS-level surfaces show "Yishan" instead of the scoped
    // package name "@yishan/desktop".
    app.setName("Yishan");

    // Pre-load daemon settings so before-quit has the correct value even
    // when the user never opens the Settings view during this session.
    try {
      this.cachedDaemonQuitOnExit = await getDaemonQuitOnExit();
    } catch (error: unknown) {
      console.warn("Failed to load daemon quit-on-exit setting:", error);
      this.cachedDaemonQuitOnExit = false;
    }

    this.daemonJwtSecret = await ensureDaemonJwtSecret();
    await this.daemonManager.ensureStarted();
    this.registerHostIpcHandlers();
    this.registerAuthIpcHandlers();
    this.createMainWindow();
    configureApplicationMenu({
      appName: "Yishan",
      devMode: isDevMode(),
      dispatchAction: (payload, options) => {
        this.dispatchAction(payload, options);
      },
      checkForUpdates: () => {
        void this.handleManualUpdateCheck();
      },
    });
    startAutoUpdates({
      app,
      notifyUpdateEvent: (payload) => {
        this.dispatchUpdateEvent(payload);
      },
    });

    app.on("before-quit", (event) => {
      this.isQuitting = true;

      if (this.hasProcessedBeforeQuit) {
        return;
      }

      event.preventDefault();

      void this.confirmQuit().then((shouldQuit) => {
        if (!shouldQuit) {
          this.isQuitting = false;
          return;
        }

        this.hasProcessedBeforeQuit = true;
        void this.runBeforeQuitCleanup().finally(() => {
          app.quit();
        });
      });
    });

    app.on("activate", () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
      } else {
        this.createMainWindow();
      }
    });

    app.on("open-url", (event, callbackUrl) => {
      event.preventDefault();
      this.handleProtocolCallbackUrl(callbackUrl);
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin" || this.isQuitting) {
        app.quit();
      }
    });

    if (this.pendingProtocolUrl) {
      const callbackUrl = this.pendingProtocolUrl;
      this.pendingProtocolUrl = null;
      this.handleProtocolCallbackUrl(callbackUrl);
    }
  }

  private registerWorkspaceFileProtocol(): void {
    protocol.handle(WORKSPACE_FILE_PROTOCOL, async (request) => {
      try {
        const parsedUrl = new URL(request.url);
        if (parsedUrl.hostname !== WORKSPACE_FILE_PROTOCOL_HOST) {
          return new Response("Not found", { status: 404 });
        }

        const workspaceWorktreePath = parsedUrl.searchParams.get("workspaceWorktreePath")?.trim() ?? "";
        const relativePath = parsedUrl.searchParams.get("relativePath")?.trim() ?? "";
        if (!workspaceWorktreePath || !relativePath) {
          return new Response("Missing workspaceWorktreePath or relativePath", { status: 400 });
        }

        const resolvedWorktreePath = resolve(workspaceWorktreePath);
        const resolvedFilePath = resolve(resolvedWorktreePath, relativePath);
        if (!isPathWithinOrEqual(resolvedWorktreePath, resolvedFilePath)) {
          return new Response("Path escapes workspace root", { status: 403 });
        }

        return await net.fetch(pathToFileURL(resolvedFilePath).toString());
      } catch {
        return new Response("Failed to read workspace file", { status: 500 });
      }
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

  /** Registers desktop auth IPC endpoints backed by the bundled CLI login/status commands. */
  private registerAuthIpcHandlers() {
    ipcMain.handle(HOST_IPC_CHANNELS.getDesktopAppVersion, async () => {
      return app.getVersion();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getAuthStatus, async () => {
      return await getAuthStatus();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.login, async () => {
      return await login();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getDaemonInfo, async () => {
      return await this.daemonManager.getInfo();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.restartDaemon, async () => {
      try {
        await this.daemonManager.stop();
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "Failed to stop daemon";
        console.warn("Daemon stop during restart:", reason);
      }

      try {
        await this.daemonManager.ensureStarted();
        const info = await this.daemonManager.getInfo();
        return { success: true as const, daemonInfo: info };
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "Failed to start daemon";
        return { success: false as const, error: reason };
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

    ipcMain.handle(HOST_IPC_CHANNELS.getDaemonJwt, async () => {
      if (!this.daemonJwtSecret) {
        this.daemonJwtSecret = await ensureDaemonJwtSecret();
      }
      return createDaemonJwt(this.daemonJwtSecret);
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

    ipcMain.handle(HOST_IPC_CHANNELS.copyFiles, async (_event, input) => {
      try {
        const sourcePaths: string[] = Array.isArray(input?.sourcePaths) ? input.sourcePaths : [];
        const destinationDirectory = String(input?.destinationDirectory ?? "");
        if (sourcePaths.length === 0) {
          return { ok: false, error: "sourcePaths is required" };
        }
        if (!destinationDirectory) {
          return { ok: false, error: "destinationDirectory is required" };
        }

        // Ensure destination directory exists
        await mkdirAsync(destinationDirectory, { recursive: true });

        const copiedPaths: string[] = [];
        for (const sourcePath of sourcePaths) {
          const name = basename(sourcePath);
          const destPath = join(destinationDirectory, name);
          const stat = await statAsync(sourcePath);
          if (stat.isDirectory()) {
            await cpAsync(sourcePath, destPath, { recursive: true });
          } else {
            await copyFileAsync(sourcePath, destPath);
          }
          copiedPaths.push(destPath);
        }

        return { ok: true, copiedPaths };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle(HOST_IPC_CHANNELS.writeFileBase64, async (_event, input) => {
      try {
        const absolutePath = String(input?.absolutePath ?? "");
        const contentBase64 = String(input?.contentBase64 ?? "");
        if (!absolutePath) {
          return { ok: false, error: "absolutePath is required" };
        }
        if (!contentBase64) {
          return { ok: false, error: "contentBase64 is required" };
        }

        // Ensure parent directory exists
        const parentDir = join(absolutePath, "..");
        await mkdirAsync(parentDir, { recursive: true });

        const buffer = Buffer.from(contentBase64, "base64");
        await writeFileAsync(absolutePath, buffer);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle(HOST_IPC_CHANNELS.loadBrowserHistory, async () => {
      return await loadBrowserHistoryGroups();
    });

    ipcMain.handle(HOST_IPC_CHANNELS.appendBrowserHistory, async (_event, input) => {
      await appendBrowserHistoryEntry(input?.entry);
      return { ok: true };
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
      try {
        await notificationAdapter.playSound({
          eventType: "run-finished",
          soundId: input.soundId,
          volume: input.volume,
        });

        return {
          played: true,
        };
      } catch (error) {
        console.error("Notification sound playback failed:", error);
        return {
          played: false,
          reason: "sound-player-unavailable" as const,
        };
      }
    });

    ipcMain.handle(HOST_IPC_CHANNELS.getPendingUpdate, async () => {
      return this.pendingUpdateReady;
    });

    ipcMain.handle(HOST_IPC_CHANNELS.checkForUpdates, async () => {
      await this.handleManualUpdateCheck();
      return { ok: true as const };
    });

    ipcMain.handle(HOST_IPC_CHANNELS.downloadUpdate, async () => {
      const result = await downloadUpdate();
      if (!result.ok) {
        this.dispatchUpdateEvent({ status: "error", source: "download", message: result.error });
      }
      return result;
    });

    ipcMain.handle(HOST_IPC_CHANNELS.installUpdate, async () => {
      // Mark quit intent before electron-updater closes windows so the
      // macOS close handler does not convert update restart into a hide.
      this.isQuitting = true;
      if (!this.hasProcessedBeforeQuit) {
        this.hasProcessedBeforeQuit = true;
        await this.runBeforeQuitCleanup();
      }
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

    const result = this.mainWindow
      ? await dialog.showMessageBox(this.mainWindow, messageBoxOptions)
      : await dialog.showMessageBox(messageBoxOptions);

    return result.response === 1;
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

  /** Forwards app update events to renderer update prompts. */
  private dispatchUpdateEvent(payload: DesktopUpdateEventPayload): void {
    this.pendingUpdateReady = payload.status === "not-available" || payload.status === "error" ? null : payload;
    this.mainWindow?.webContents.send(DESKTOP_RPC_IPC_CHANNELS.event, {
      method: "desktopUpdate",
      payload,
    });
  }

  /** Handles a manual "Check for Updates" request from the native menu. */
  private async handleManualUpdateCheck(): Promise<void> {
    // Disable the menu item while checking to provide visual feedback.
    this.setUpdateMenuItemEnabled(false, "Checking for Updates…");
    this.focusMainWindow();
    this.dispatchUpdateEvent({ status: "checking", source: "manual" });

    try {
      const result = await checkForUpdatesManually({ app });

      this.setUpdateMenuItemEnabled(true);

      switch (result.status) {
        case "update-available": {
          this.dispatchUpdateEvent({ status: "available", source: "manual", version: result.version });
          break;
        }
        case "up-to-date": {
          this.dispatchUpdateEvent({ status: "not-available", source: "manual" });
          break;
        }
        case "error": {
          this.dispatchUpdateEvent({ status: "error", source: "manual", message: result.message });
          break;
        }
        case "not-available": {
          const reason =
            result.reason === "development"
              ? "Update checking is not available in development mode."
              : "Update checking is not available for unpackaged builds.";
          this.dispatchUpdateEvent({ status: "error", source: "manual", message: reason });
          break;
        }
      }
    } catch (error: unknown) {
      this.setUpdateMenuItemEnabled(true);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      this.dispatchUpdateEvent({ status: "error", source: "manual", message });
    }
  }

  /** Updates the "Check for Updates" menu item's enabled state and label. */
  private setUpdateMenuItemEnabled(enabled: boolean, label = "Check for Updates"): void {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;

    const appMenu = menu.items[0]?.submenu;
    if (!appMenu) return;

    const updateItem = appMenu.items.find(
      (item) => item.label === "Check for Updates" || item.label === "Checking for Updates…",
    );
    if (updateItem) {
      updateItem.enabled = enabled;
      updateItem.label = label;
    }
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
        webviewTag: true,
      },
    });

    // On macOS, intercept the window close to hide instead of destroy,
    // allowing the app to stay in the Dock. During a quit flow, allow
    // the close to proceed so the app can fully terminate.
    if (process.platform === "darwin") {
      mainWindow.on("close", (event) => {
        if (!this.isQuitting) {
          event.preventDefault();
          mainWindow.hide();
        }
      });
    }

    // Keep shortcut behavior centralized in renderer actions while ensuring
    // shortcuts still fire when focus is inside a <webview> guest. Keyboard
    // events from webview content do not reliably reach renderer window
    // listeners, so intercept in main and dispatch one app action back.
    const handleAppShortcut = (event: Electron.Event, input: Electron.Input) => {
      if (input.type !== "keyDown" && input.type !== "rawKeyDown") {
        return;
      }

      const normalizedKey = input.key.trim().toLowerCase();
      const isPrimaryModifier = process.platform === "darwin" ? input.meta && !input.control : input.control && !input.meta;
      if (!isPrimaryModifier || input.alt) {
        return;
      }

      if (!input.shift && normalizedKey === "o") {
        event.preventDefault();
        this.dispatchAction({ action: ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP });
        return;
      }

      if (!input.shift && normalizedKey === "w") {
        event.preventDefault();
        this.dispatchAction({ action: ACTIONS.CLOSE_TAB }, { focusApp: true });
        return;
      }

      if (!input.shift && normalizedKey === "t") {
        event.preventDefault();
        this.dispatchAction({ action: ACTIONS.OPEN_TERMINAL_TAB });
        return;
      }

      if (input.shift && normalizedKey === "b") {
        event.preventDefault();
        this.dispatchAction({ action: ACTIONS.OPEN_BROWSER_TAB });
      }
    };

    mainWindow.webContents.on("before-input-event", handleAppShortcut);

    // Intercept popup/new-window requests from <webview> guests (e.g. Cmd+Click,
    // target="_blank", window.open) and forward the URL to the renderer so it can
    // open the destination in a new in-app browser tab instead of a popup window.
    mainWindow.webContents.on("did-attach-webview", (_event, webviewContents) => {
      webviewContents.on("before-input-event", handleAppShortcut);
      webviewContents.setWindowOpenHandler((details) => {
        mainWindow.webContents.send(DESKTOP_RPC_IPC_CHANNELS.event, {
          method: "webviewOpenUrl",
          payload: { url: details.url },
        });
        return { action: "deny" };
      });
    });

    mainWindow.on("closed", () => {
      if (this.mainWindow === mainWindow) {
        this.mainWindow = null;
      }
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
