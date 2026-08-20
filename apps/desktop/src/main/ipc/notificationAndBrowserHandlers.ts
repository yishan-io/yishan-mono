import { ipcMain, systemPreferences } from "electron";
import { appendBrowserHistoryEntry, loadBrowserHistoryGroups } from "../browser/browserHistory";
import { desktopHostChannels } from "../bridge/channels";
import { createDesktopNotificationHostAdapter } from "../notifications/service";

/**
 * Registers IPC handlers for notifications (dispatch, sound, microphone)
 * and browser history (load, append).
 */
export function registerNotificationAndBrowserIpcHandlers() {
  const notificationAdapter = createDesktopNotificationHostAdapter();

  ipcMain.handle(desktopHostChannels.loadBrowserHistory, async () => {
    return await loadBrowserHistoryGroups();
  });

  ipcMain.handle(desktopHostChannels.appendBrowserHistory, async (_event, input) => {
    await appendBrowserHistoryEntry(input?.entry);
    return { ok: true };
  });

  ipcMain.handle(desktopHostChannels.dispatchNotification, async (_event, input) => {
    const notificationResult = await notificationAdapter.driver.show({
      title: input.title,
      body: input.body,
      silent: input.silent,
    });

    return {
      sent: true,
      notificationId: notificationResult?.notificationId,
    };
  });

  ipcMain.handle(desktopHostChannels.playNotificationSound, async (_event, input) => {
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

  ipcMain.handle(desktopHostChannels.requestMicrophoneAccess, async () => {
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
