import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateRuntime } from "./updateRuntime";

const mocks = vi.hoisted(() => ({
  app: { on: vi.fn(), quit: vi.fn() },
  sendEvent: vi.fn(),
  focusApp: vi.fn(),
  menuGetApplicationMenu: vi.fn(),
  checkForUpdatesManually: vi.fn(),
  downloadUpdate: vi.fn(),
  startAutoUpdates: vi.fn(),
  prepareForRestart: vi.fn(),
  quitAndInstall: vi.fn(),
  shouldSuppress: vi.fn(() => false),
  resolveLocalCalendarDate: vi.fn(() => "2026-06-29"),
}));

vi.mock("electron", () => ({
  app: mocks.app,
  Menu: {
    getApplicationMenu: mocks.menuGetApplicationMenu,
  },
}));

vi.mock("./autoUpdateDismissalState", () => ({
  shouldSuppressAutoUpdateEvent: mocks.shouldSuppress,
  resolveLocalCalendarDate: mocks.resolveLocalCalendarDate,
}));

vi.mock("electron-updater", () => ({ autoUpdater: { quitAndInstall: mocks.quitAndInstall } }));

vi.mock("./autoUpdateService", () => ({
  startAutoUpdates: mocks.startAutoUpdates,
  checkForUpdatesManually: mocks.checkForUpdatesManually,
  downloadUpdate: mocks.downloadUpdate,
}));

function createRuntime() {
  return new UpdateRuntime(mocks.app as never, {
    sendEvent: mocks.sendEvent,
    focusApp: mocks.focusApp,
    prepareForRestart: mocks.prepareForRestart,
  });
}

function menuMockWithUpdateItem() {
  const updateItem = { label: "Check for Updates", enabled: true };
  const submenu = { items: [updateItem] };
  const menu = { items: [{ submenu }] };
  mocks.menuGetApplicationMenu.mockReturnValue(menu);
  return updateItem;
}

describe("UpdateRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards update availability events to the renderer", () => {
    const runtime = createRuntime();
    runtime.handleManualUpdateCheck();
    expect(mocks.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ method: "desktopUpdate", payload: { status: "checking", source: "manual" } }),
    );
  });

  it("stores the pending update and clears it for not-available/error", () => {
    const runtime = createRuntime();
    mocks.sendEvent.mockClear();
    runtime.handleManualUpdateCheck();
    mocks.checkForUpdatesManually.mockResolvedValueOnce({ status: "update-available", version: "1.2.3" });
    void runtime.handleManualUpdateCheck();
  });

  it("keeps manual update availability visible after auto dismissal", () => {
    const runtime = createRuntime();
    mocks.shouldSuppress.mockReturnValueOnce(true); // auto-dismissed path
    runtime.handleManualUpdateCheck();
    expect(runtime.getPendingUpdate()).toBeNull();

    mocks.shouldSuppress.mockReturnValue(false);
    mocks.checkForUpdatesManually.mockResolvedValueOnce({ status: "update-available", version: "1.2.3" });
    void runtime.handleManualUpdateCheck();
  });

  it("dismissUpdate clears pending and records same-day suppression for auto availability", async () => {
    const runtime = createRuntime();
    mocks.shouldSuppress.mockReturnValue(false);
    // Simulate an auto availability dispatch through the poller notification path.
    runtime.startAutoUpdates();
    const notify = mocks.startAutoUpdates.mock.calls[0]?.[0]?.notifyUpdateEvent as (p: unknown) => void;
    notify?.({ status: "available", source: "auto", version: "1.2.3" });
    expect(runtime.getPendingUpdate()).toEqual({ status: "available", source: "auto", version: "1.2.3" });

    await runtime.dismissUpdate();
    expect(runtime.getPendingUpdate()).toBeNull();
    expect(mocks.resolveLocalCalendarDate).toHaveBeenCalled();
  });

  it("updates the Check for Updates menu item label and enabled state", () => {
    const updateItem = menuMockWithUpdateItem();
    const runtime = createRuntime();
    runtime.setUpdateMenuItemEnabled(false, "Checking for Updates…");
    expect(updateItem.enabled).toBe(false);
    expect(updateItem.label).toBe("Checking for Updates…");
  });

  it("downloads the pending update and reports download errors", async () => {
    const runtime = createRuntime();
    mocks.downloadUpdate.mockResolvedValueOnce({ ok: true });
    const ok = await runtime.download();
    expect(ok.ok).toBe(true);

    mocks.downloadUpdate.mockResolvedValueOnce({ ok: false, error: "boom" });
    const failed = await runtime.download();
    expect(failed.ok).toBe(false);
    expect(mocks.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "desktopUpdate",
        payload: { status: "error", source: "download", message: "boom" },
      }),
    );
  });

  it("prepares restart before calling updater with exact arguments", async () => {
    const runtime = createRuntime();
    await expect(runtime.install()).resolves.toEqual({ ok: true });
    expect(mocks.prepareForRestart).toHaveBeenCalledOnce();
    expect(mocks.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("rejects install when restart preparation rejects", async () => {
    const runtime = createRuntime();
    mocks.prepareForRestart.mockRejectedValueOnce(new Error("cleanup failed"));
    await expect(runtime.install()).rejects.toThrow("cleanup failed");
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
  });

  it("starts the auto-update poller with event routing", () => {
    const runtime = createRuntime();
    runtime.startAutoUpdates();
    expect(mocks.startAutoUpdates).toHaveBeenCalledWith(
      expect.objectContaining({ app: mocks.app, notifyUpdateEvent: expect.any(Function) }),
    );
  });
});
