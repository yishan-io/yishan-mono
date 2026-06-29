import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp"),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    exit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(),
    setName: vi.fn(),
    getVersion: vi.fn(() => "0.0.0"),
  },
  BrowserWindow: vi.fn(),
  Menu: { getApplicationMenu: vi.fn() },
  dialog: {},
  ipcMain: { handle: vi.fn() },
  protocol: { handle: vi.fn() },
  session: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(),
    },
  },
  net: { fetch: vi.fn() },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: { quitAndInstall: vi.fn() },
}));

vi.mock("./app/menu", () => ({
  configureApplicationMenu: vi.fn(),
}));

vi.mock("./auth/cliAuth", () => ({
  getAuthStatus: vi.fn(),
  login: vi.fn(),
}));

vi.mock("./browser/browserHistory", () => ({
  flushBrowserHistoryPruneCheck: vi.fn(),
}));

vi.mock("./cli/cliInstaller", () => ({
  getDesktopCliInstallStatus: vi.fn(),
  installDesktopCli: vi.fn(),
  uninstallDesktopCli: vi.fn(),
}));

vi.mock("./daemon/daemonHealthCheck", () => ({
  resolveDaemonLogFilePath: vi.fn(),
}));

vi.mock("./daemon/daemonManager", () => ({
  DaemonManager: class {
    ensureStarted = vi.fn();
    stop = vi.fn();
    getInfo = vi.fn();
  },
}));

vi.mock("./daemon/daemonSettings", () => ({
  getDaemonQuitOnExit: vi.fn(),
  setDaemonQuitOnExit: vi.fn(),
}));

vi.mock("./ipc/fileHandlers", () => ({
  registerFileIpcHandlers: vi.fn(),
}));

vi.mock("./ipc/notificationAndBrowserHandlers", () => ({
  registerNotificationAndBrowserIpcHandlers: vi.fn(),
}));

vi.mock("./runtime/environment", () => ({
  isDevMode: vi.fn(() => false),
}));

vi.mock("./updates/autoUpdateService", () => ({
  checkForUpdatesManually: vi.fn(),
  downloadUpdate: vi.fn(),
  startAutoUpdates: vi.fn(),
}));

vi.mock("./updates/autoUpdateDismissalState", () => ({
  resolveLocalCalendarDate: vi.fn(() => "2026-06-29"),
  shouldSuppressAutoUpdateEvent: vi.fn(
    (payload: { status: string; source?: string }, dismissedAutoUpdateDate: string | null) =>
      payload.status === "available" && payload.source === "auto" && dismissedAutoUpdateDate === "2026-06-29",
  ),
}));

import { DesktopApplication } from "./DesktopApplication";

describe("DesktopApplication update dismissal", () => {
  it("suppresses auto update availability when already dismissed today", () => {
    const desktopApplication = new DesktopApplication() as unknown as {
      mainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
      dismissedAutoUpdateDate: string | null;
      pendingUpdateReady: unknown;
      dispatchUpdateEvent: (payload: unknown) => void;
    };
    const send = vi.fn();
    desktopApplication.mainWindow = { webContents: { send } };
    desktopApplication.dismissedAutoUpdateDate = "2026-06-29";

    desktopApplication.dispatchUpdateEvent({ status: "available", source: "auto", version: "1.2.3" });

    expect(send).not.toHaveBeenCalled();
    expect(desktopApplication.pendingUpdateReady).toBeNull();
  });

  it("still forwards manual update availability after auto dismissal", () => {
    const desktopApplication = new DesktopApplication() as unknown as {
      mainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
      dismissedAutoUpdateDate: string | null;
      pendingUpdateReady: unknown;
      dispatchUpdateEvent: (payload: unknown) => void;
    };
    const send = vi.fn();
    desktopApplication.mainWindow = { webContents: { send } };
    desktopApplication.dismissedAutoUpdateDate = "2026-06-29";

    desktopApplication.dispatchUpdateEvent({ status: "available", source: "manual", version: "1.2.3" });

    expect(send).toHaveBeenCalledWith("desktop:rpc/event", {
      method: "desktopUpdate",
      payload: { status: "available", source: "manual", version: "1.2.3" },
    });
    expect(desktopApplication.pendingUpdateReady).toEqual({ status: "available", source: "manual", version: "1.2.3" });
  });

  it("clears the pending auto update and persists same-day dismissal on close", async () => {
    const desktopApplication = new DesktopApplication() as unknown as {
      pendingUpdateReady: unknown;
      dismissedAutoUpdateDate: string | null;
      dismissUpdate: () => Promise<void>;
    };
    desktopApplication.pendingUpdateReady = { status: "available", source: "auto", version: "1.2.3" };

    await desktopApplication.dismissUpdate();

    expect(desktopApplication.pendingUpdateReady).toBeNull();
    expect(desktopApplication.dismissedAutoUpdateDate).toBe("2026-06-29");
  });
});
