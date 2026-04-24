import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { getAuthStatus, login } from "./auth/cliAuth";
import { HOST_IPC_CHANNELS } from "./ipc";

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
