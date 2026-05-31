import { ipcMain, systemPreferences } from "electron";
import { createDesktopNotificationHostAdapter } from "../notifications/service";
import { HOST_IPC_CHANNELS } from "../ipc";
import {
  appendBrowserHistoryEntry,
  loadBrowserHistoryGroups,
} from "../browser/browserHistory";

/**
 * Registers IPC handlers for notifications (dispatch, sound, microphone)
 * and browser history (load, append).
 */
export function registerNotificationAndBrowserIpcHandlers() {
  const notificationAdapter = createDesktopNotificationHostAdapter();

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

  ipcMain.handle(HOST_IPC_CHANNELS.requestMicrophoneAccess, async () => {
    if (process.platform !== "darwin") {
      return { granted: true };
    }

    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") {
      return { granted: true };
    }

    return { granted: await systemPreferences.askForMediaAccess("microphone") };
  });
}
