import { join } from "node:path";
import { BrowserWindow, type WebContents } from "electron";
import { DESKTOP_RPC_IPC_CHANNELS } from "../ipc";

export type MainWindowOptions = {
  /** Returns true when the app is in a quit flow (macOS close should destroy). */
  shouldAllowClose: () => boolean;
  /** Invoked when the window is destroyed so the owner can drop its handle. */
  onClosed: () => void;
};

function isToggleDevToolsShortcut(input: Electron.Input): boolean {
  if (input.type !== "keyDown" && input.type !== "rawKeyDown") {
    return false;
  }

  const normalizedKey = input.key.trim().toLowerCase();
  if (normalizedKey === "f12") {
    return true;
  }

  if (normalizedKey !== "i") {
    return false;
  }

  if (process.platform === "darwin") {
    return input.meta && input.alt;
  }

  return input.control && input.shift;
}

function isPrimaryShortcutModifierPressed(input: Electron.Input): boolean {
  return process.platform === "darwin" ? input.meta && !input.control : input.control && !input.meta;
}

function isWebviewReservedShortcut(input: Electron.Input): boolean {
  const normalizedKey = input.key.trim().toLowerCase();
  const isPrimaryModifier = isPrimaryShortcutModifierPressed(input);
  if (!isPrimaryModifier || input.alt) {
    return false;
  }

  if (input.shift) {
    return (
      normalizedKey === "b" ||
      normalizedKey === "r" ||
      normalizedKey === "f" ||
      normalizedKey === "g" ||
      normalizedKey === "w"
    );
  }

  if (
    normalizedKey === "/" ||
    normalizedKey === "w" ||
    normalizedKey === "y" ||
    normalizedKey === "n" ||
    normalizedKey === "t"
  ) {
    return true;
  }

  if (
    normalizedKey === "b" ||
    normalizedKey === "l" ||
    normalizedKey === "p" ||
    normalizedKey === "o" ||
    normalizedKey === "z"
  ) {
    return true;
  }

  if (normalizedKey === "backspace" || normalizedKey === "delete") {
    return true;
  }

  return /^[1-9]$/.test(normalizedKey);
}

function isWorkspaceNavigationShortcut(input: Electron.Input): boolean {
  if (input.type !== "keyDown" && input.type !== "rawKeyDown") {
    return false;
  }

  const normalizedKey = input.key.trim().toLowerCase();
  return (
    input.control && input.meta && !input.alt && !input.shift && (normalizedKey === "j" || normalizedKey === "k")
  );
}

function sendWebviewKeydown(mainWebContents: WebContents, input: Electron.Input): void {
  mainWebContents.send(DESKTOP_RPC_IPC_CHANNELS.event, {
    method: "webviewKeydown",
    payload: {
      key: input.key,
      code: input.code,
      ctrlKey: input.control,
      metaKey: input.meta,
      shiftKey: input.shift,
      altKey: input.alt,
    },
  });
}

/**
 * MainWindow — one owner for main BrowserWindow construction, input routing,
 * webview guest handling, focus, and window-state helpers.
 */
export class MainWindow {
  private window: BrowserWindow | null = null;

  constructor(private readonly options: MainWindowOptions) {}

  /** The underlying BrowserWindow, or null once destroyed. */
  get browserWindow(): BrowserWindow | null {
    return this.window;
  }

  get webContentsId(): number | undefined {
    return this.window?.webContents?.id;
  }

  /** Creates and wires the main window. Idempotent while one exists. */
  create(): BrowserWindow {
    if (this.window) {
      return this.window;
    }

    const { shouldAllowClose, onClosed } = this.options;
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
        if (!shouldAllowClose()) {
          event.preventDefault();
          mainWindow.hide();
        }
      });
    }

    // Intercept popup/new-window requests from <webview> guests (e.g. Cmd+Click,
    // target="_blank", window.open) and forward the URL to the renderer so it can
    // open the destination in a new in-app browser tab instead of a popup window.
    mainWindow.webContents.on("before-input-event", (inputEvent, input) => {
      if (isToggleDevToolsShortcut(input)) {
        mainWindow.webContents.toggleDevTools();
        inputEvent.preventDefault();
        return;
      }

      if (isWorkspaceNavigationShortcut(input)) {
        inputEvent.preventDefault();
        sendWebviewKeydown(mainWindow.webContents, input);
      }
    });

    mainWindow.webContents.on("did-attach-webview", (_event, webviewContents) => {
      webviewContents.on("before-input-event", (_inputEvent, input) => {
        if (isToggleDevToolsShortcut(input)) {
          mainWindow.webContents.toggleDevTools();
          _inputEvent.preventDefault();
          return;
        }

        if (input.type !== "keyDown" && input.type !== "rawKeyDown") {
          return;
        }

        sendWebviewKeydown(mainWindow.webContents, input);

        // Let native edit shortcuts reach Chromium, but suppress known app-level
        // bindings so they don't trigger both page/menu behavior and app actions.
        if (isWebviewReservedShortcut(input)) {
          _inputEvent.preventDefault();
        }
      });

      webviewContents.setWindowOpenHandler((details) => {
        mainWindow.webContents.send(DESKTOP_RPC_IPC_CHANNELS.event, {
          method: "webviewOpenUrl",
          payload: { url: details.url },
        });
        return { action: "deny" };
      });
    });

    mainWindow.on("closed", () => {
      if (this.window === mainWindow) {
        this.window = null;
      }
      onClosed();
    });

    this.window = mainWindow;
    return mainWindow;
  }

  /** Loads the renderer (dev URL in dev, bundled index.html otherwise). */
  loadRenderer(): void {
    if (!this.window) {
      return;
    }
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
      void this.window.loadURL(rendererUrl);
      this.window.webContents.openDevTools({ mode: "detach" });
    } else {
      void this.window.loadFile(join(__dirname, "..", "renderer", "index.html"));
    }
  }

  /** Shows and focuses the window. */
  focus(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
    }
  }

  /** Toggles maximized state. */
  toggleMaximized(): void {
    const window = this.window;
    if (!window) {
      return;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }

  /** Returns the fullscreen state, or false when no window exists. */
  isFullscreen(): boolean {
    return this.window?.isFullScreen() ?? false;
  }
}
