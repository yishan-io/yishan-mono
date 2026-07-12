import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  getMediaAccessStatus: vi.fn(() => "granted"),
  askForMediaAccess: vi.fn(async () => true),
  loadBrowserHistoryGroups: vi.fn(async () => []),
  appendBrowserHistoryEntry: vi.fn(async () => undefined),
  driverShow: vi.fn(async () => ({ notificationId: "notification-1" })),
  playSound: vi.fn(async () => undefined),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
  systemPreferences: {
    getMediaAccessStatus: mocks.getMediaAccessStatus,
    askForMediaAccess: mocks.askForMediaAccess,
  },
}));

vi.mock("../browser/browserHistory", () => ({
  loadBrowserHistoryGroups: mocks.loadBrowserHistoryGroups,
  appendBrowserHistoryEntry: mocks.appendBrowserHistoryEntry,
}));

vi.mock("../notifications/service", () => ({
  createDesktopNotificationHostAdapter: vi.fn(() => ({
    driver: {
      show: mocks.driverShow,
    },
    playSound: mocks.playSound,
  })),
}));

describe("registerNotificationAndBrowserIpcHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards silent notifications through the IPC handler", async () => {
    const { HOST_IPC_CHANNELS } = await import("../ipc");
    const { registerNotificationAndBrowserIpcHandlers } = await import("./notificationAndBrowserHandlers");

    registerNotificationAndBrowserIpcHandlers();

    const dispatchCall = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === HOST_IPC_CHANNELS.dispatchNotification,
    );
    expect(dispatchCall).toBeDefined();
    if (!dispatchCall) {
      throw new Error("Expected dispatch notification IPC handler");
    }

    const handler = dispatchCall[1] as (
      _event: unknown,
      input: { title: string; body?: string; silent?: boolean },
    ) => Promise<unknown>;
    await handler({}, { title: "Run completed", body: "Done", silent: true });

    expect(mocks.driverShow).toHaveBeenCalledWith({
      title: "Run completed",
      body: "Done",
      silent: true,
    });
  });
});
