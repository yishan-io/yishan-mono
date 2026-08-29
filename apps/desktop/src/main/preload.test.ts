import { beforeEach, describe, expect, it, vi } from "vitest";
import { desktopHostChannels, desktopHostEventChannels } from "./bridge/channels";
import type { DesktopBridge, DesktopHostBridge } from "./bridge/desktopBridge";

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  getPathForFile: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: { invoke: mocks.invoke, on: mocks.on, removeListener: mocks.removeListener },
  webUtils: { getPathForFile: mocks.getPathForFile },
}));

const hostCallArguments = {
  getDesktopAppVersion: [],
  openLocalFolderDialog: [{ startingFolder: "/tmp" }],
  toggleMainWindowMaximized: [],
  getMainWindowFullscreenState: [],
  openEntryInExternalApp: [{ workspaceWorktreePath: "/tmp", appId: "vscode" }],
  listDetectedExternalAppIds: [],
  openExternalUrl: [{ url: "https://example.com" }],
  readExternalClipboardSourcePaths: [],
  resolveRealPath: ["/tmp/path"],
  copyFiles: [{ sourcePaths: ["/tmp/source"], destinationDirectory: "/tmp/destination" }],
  writeFileBase64: [{ absolutePath: "/tmp/file", contentBase64: "dGVzdA==" }],
  loadBrowserHistory: [],
  appendBrowserHistory: [{ entry: { url: "https://example.com", title: "Example", visitedAt: "2026-08-20" } }],
  dispatchNotification: [{ title: "Title" }],
  playNotificationSound: [{ soundId: "chime", volume: 1 }],
  requestMicrophoneAccess: [],
  getPendingUpdate: [],
  dismissUpdate: [],
  checkForUpdates: [],
  downloadUpdate: [],
  installUpdate: [],
  getAuthStatus: [],
  login: [],
  getDaemonInfo: [],
  restartDaemon: [],
  readDaemonLog: ["system"],
  getDaemonQuitOnExit: [],
  setDaemonQuitOnExit: [true],
  writeClipboardText: ["text"],
} satisfies Record<keyof DesktopHostBridge, unknown[]>;

async function loadPreloadBridge(): Promise<{
  bridge: DesktopBridge;
  desktop: { getPathForFile: (file: File) => string };
}> {
  await import("./preload");
  const bridge = mocks.exposeInMainWorld.mock.calls.find(([name]) => name === "__YISHAN__")?.[1] as
    | DesktopBridge
    | undefined;
  const desktop = mocks.exposeInMainWorld.mock.calls.find(([name]) => name === "desktop")?.[1] as
    | { getPathForFile: (file: File) => string }
    | undefined;
  expect(bridge).toBeDefined();
  expect(desktop).toBeDefined();
  return { bridge: bridge as DesktopBridge, desktop: desktop as { getPathForFile: (file: File) => string } };
}

describe("preload bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("exposes desktop helpers and an immutable bridge", async () => {
    const { bridge, desktop } = await loadPreloadBridge();

    expect(mocks.exposeInMainWorld).toHaveBeenCalledWith(
      "desktop",
      expect.objectContaining({ platform: process.platform }),
    );
    expect(Object.isFrozen(bridge)).toBe(true);
    desktop.getPathForFile("file" as unknown as File);
    expect(mocks.getPathForFile).toHaveBeenCalledWith("file");
  });

  it.each(Object.entries(hostCallArguments))("invokes %s on its exact channel and arguments", async (method, args) => {
    const { bridge } = await loadPreloadBridge();
    const hostMethod = bridge.host[method as keyof DesktopHostBridge] as (...parameters: unknown[]) => unknown;

    hostMethod(...args);

    expect(mocks.invoke).toHaveBeenCalledWith(desktopHostChannels[method as keyof typeof desktopHostChannels], ...args);
  });

  it("subscribes and removes the same event listener", async () => {
    const { bridge } = await loadPreloadBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.events.subscribe(listener);
    const registeredHandler = mocks.on.mock.calls[0]?.[1];

    expect(registeredHandler).toBeDefined();
    expect(mocks.on).toHaveBeenCalledWith(desktopHostEventChannels.event, registeredHandler);
    (registeredHandler as (event: unknown, envelope: unknown) => void)({}, { method: "desktopUpdate" });
    expect(listener).toHaveBeenCalledWith({ method: "desktopUpdate" });

    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledWith(desktopHostEventChannels.event, registeredHandler);
  });
});
