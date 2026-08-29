import { beforeEach, describe, expect, it, vi } from "vitest";
import { desktopHostChannels } from "./channels";
import { registerDesktopHostIpc } from "./registerDesktopHostIpc";

const mocks = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock("electron", () => ({
  ipcMain: { handle: mocks.handle },
}));

function registerHandlers() {
  const operations = {
    getVersion: vi.fn(() => "1.0.0"),
    getStatus: vi.fn(async () => ({ authenticated: true })),
    login: vi.fn(async () => ({ authenticated: true, skipped: false })),
    getInfo: vi.fn(async () => ({ daemonId: "daemon", version: "1", wsUrl: "ws://localhost" })),
    restart: vi.fn(async () => ({ success: true as const })),
    readLog: vi.fn(async () => ({ ok: true as const, content: "log" })),
    getQuitOnExit: vi.fn(async () => true),
    setQuitOnExit: vi.fn(async () => ({ ok: true as const })),
    pickFolder: vi.fn(async () => "/workspace"),
    toggleMaximized: vi.fn(),
    isFullscreen: vi.fn(() => true),
    getPendingUpdate: vi.fn(() => null),
    dismissUpdate: vi.fn(async () => undefined),
    handleManualUpdateCheck: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ ok: true })),
    install: vi.fn(async () => ({ ok: true as const })),
    load: vi.fn(async () => []),
    append: vi.fn(async () => undefined),
    dispatch: vi.fn(async () => ({ sent: true })),
    playSound: vi.fn(async () => ({ played: true })),
    requestMicrophoneAccess: vi.fn(async () => ({ granted: true })),
    resolveRealPath: vi.fn(async (path: string) => ({ path })),
    copyFiles: vi.fn(async () => ({ ok: true })),
    writeFileBase64: vi.fn(async () => ({ ok: true })),
    openEntry: vi.fn(async () => ({ ok: true })),
    list: vi.fn(async () => ["vscode"]),
    openUrl: vi.fn(async () => ({ opened: true })),
    readExternalFiles: vi.fn(async () => ({ sourcePaths: [] })),
    writeText: vi.fn(() => ({ ok: true as const })),
  };

  registerDesktopHostIpc({
    app: { getVersion: operations.getVersion },
    auth: { getStatus: operations.getStatus, login: operations.login },
    daemon: {
      getInfo: operations.getInfo,
      restart: operations.restart,
      readLog: operations.readLog,
      getQuitOnExit: operations.getQuitOnExit,
      setQuitOnExit: operations.setQuitOnExit,
    },
    window: {
      pickFolder: operations.pickFolder,
      toggleMaximized: operations.toggleMaximized,
      isFullscreen: operations.isFullscreen,
    },
    updates: {
      getPendingUpdate: operations.getPendingUpdate,
      dismissUpdate: operations.dismissUpdate,
      handleManualUpdateCheck: operations.handleManualUpdateCheck,
      download: operations.download,
      install: operations.install,
    },
    browser: { load: operations.load, append: operations.append },
    notifications: {
      dispatch: operations.dispatch,
      playSound: operations.playSound,
      requestMicrophoneAccess: operations.requestMicrophoneAccess,
    },
    fileSystem: {
      resolveRealPath: operations.resolveRealPath,
      copyFiles: operations.copyFiles,
      writeFileBase64: operations.writeFileBase64,
    },
    externalApp: {
      openEntry: operations.openEntry,
      list: operations.list,
      openUrl: operations.openUrl,
    },
    clipboard: { readExternalFiles: operations.readExternalFiles, writeText: operations.writeText },
  });

  return operations;
}

describe("registerDesktopHostIpc", () => {
  beforeEach(() => {
    mocks.handle.mockReset();
  });

  it("registers every desktop host channel exactly once", () => {
    registerHandlers();

    const registeredChannels = mocks.handle.mock.calls.map(([channel]) => channel);
    expect(registeredChannels).toHaveLength(Object.values(desktopHostChannels).length);
    expect(new Set(registeredChannels)).toEqual(new Set(Object.values(desktopHostChannels)));
  });

  it("preserves transport arguments and registrar-owned response envelopes", async () => {
    const operations = registerHandlers();
    const handlers = new Map<string, (...args: unknown[]) => unknown>(
      mocks.handle.mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
    );

    await expect(
      handlers.get(desktopHostChannels.openLocalFolderDialog)?.({}, { startingFolder: "/tmp" }),
    ).resolves.toBe("/workspace");
    expect(handlers.get(desktopHostChannels.toggleMainWindowMaximized)?.({})).toEqual({ ok: true });
    expect(handlers.get(desktopHostChannels.getMainWindowFullscreenState)?.({})).toEqual({
      isFullscreen: true,
    });
    await expect(handlers.get(desktopHostChannels.dismissUpdate)?.({})).resolves.toEqual({ ok: true });
    await expect(
      handlers.get(desktopHostChannels.appendBrowserHistory)?.({}, { entry: { url: "https://example.com" } }),
    ).resolves.toEqual({ ok: true });
    expect(handlers.get(desktopHostChannels.writeClipboardText)?.({}, "copied")).toEqual({ ok: true });

    expect(operations.pickFolder).toHaveBeenCalledWith({ startingFolder: "/tmp" });
    expect(operations.append).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(operations.writeText).toHaveBeenCalledWith("copied");
    await expect(handlers.get(desktopHostChannels.readDaemonLog)?.({}, "account")).resolves.toEqual({
      ok: true,
      content: "log",
    });
    expect(operations.readLog).toHaveBeenCalledWith("account");
    expect(handlers.get(desktopHostChannels.readDaemonLog)?.({}, "unknown")).toEqual({
      ok: false,
      error: "Unknown daemon log source.",
    });
  });
});
