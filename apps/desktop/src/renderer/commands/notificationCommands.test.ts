// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  dispatchNotification,
  getNotificationPreferences,
  playNotificationSound,
  previewNotification,
  updateNotificationPreferences,
} from "./notificationCommands";

const mocks = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  playNotificationSound: vi.fn(),
  dispatchNotification: vi.fn(),
  playNotificationSoundBridge: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getApiServiceClient: vi.fn(async () => ({
    notification: {
      getNotificationPreferences: mocks.getNotificationPreferences,
      updateNotificationPreferences: mocks.updateNotificationPreferences,
    },
  })),
  getDaemonRpcClient: vi.fn(async () => ({
    notification: {
      getNotificationPreferences: mocks.getNotificationPreferences,
      updateNotificationPreferences: mocks.updateNotificationPreferences,
    },
  })),
  getDesktopHostBridge: vi.fn(() => ({
    dispatchNotification: mocks.dispatchNotification,
    playNotificationSound: mocks.playNotificationSoundBridge,
  })),
}));

describe("notificationCommands", () => {
  it("forwards notification requests to notification service", async () => {
    await getNotificationPreferences();
    await updateNotificationPreferences({ soundEnabled: true });
    await previewNotification({ eventType: "run-finished" });
    await playNotificationSound({ soundId: "chime", volume: 0.9 });
    await dispatchNotification({ title: "Run completed", body: "Done" });

    expect(mocks.getNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith({ soundEnabled: true });
    expect(mocks.dispatchNotification).toHaveBeenCalledWith({
      title: "Run finished",
      body: "Notification preview",
    });
    expect(mocks.playNotificationSound).not.toHaveBeenCalled();
    expect(mocks.dispatchNotification).toHaveBeenCalledWith({ title: "Run completed", body: "Done" });
    expect(mocks.playNotificationSoundBridge).toHaveBeenCalledWith({ soundId: "chime", volume: 0.9 });
  });
});
