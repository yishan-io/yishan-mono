import { describe, expect, it, vi } from "vitest";
import { startAutoUpdates } from "./autoUpdateService";

function createUpdater() {
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdatesAndNotify: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
}

describe("startAutoUpdates", () => {
  it("does not check for updates during development", () => {
    const updater = createUpdater();

    const result = startAutoUpdates({
      app: { isPackaged: true },
      updater,
      devMode: true,
    });

    expect(result).toEqual({ enabled: false, reason: "development" });
    expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it("does not check for updates from unpackaged builds", () => {
    const updater = createUpdater();

    const result = startAutoUpdates({
      app: { isPackaged: false },
      updater,
      devMode: false,
    });

    expect(result).toEqual({ enabled: false, reason: "unpackaged" });
    expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it("enables background update checks for packaged production builds", () => {
    const updater = createUpdater();

    const result = startAutoUpdates({
      app: { isPackaged: true },
      updater,
      devMode: false,
    });

    expect(result).toEqual({ enabled: true });
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);
  });

  it("notifies the renderer when an update is downloaded", () => {
    const updater = createUpdater();
    const notifyUpdateReady = vi.fn();

    startAutoUpdates({
      app: { isPackaged: true },
      updater,
      devMode: false,
      notifyUpdateReady,
    });

    const availableListener = updater.on.mock.calls.find(([event]) => event === "update-available")?.[1];
    const downloadedListener = updater.on.mock.calls.find(([event]) => event === "update-downloaded")?.[1];

    availableListener?.({ version: "1.2.3" });
    downloadedListener?.({});

    expect(notifyUpdateReady).toHaveBeenCalledWith({ version: "1.2.3" });
  });
});
