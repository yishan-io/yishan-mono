import { systemPreferences } from "electron";
import type { PlayNotificationSoundInput } from "../bridge/notifications";
import { createDesktopNotificationHostAdapter } from "./service";
/** Handles renderer notification and microphone capability operations. */
export function createNotificationHost() {
  const adapter = createDesktopNotificationHostAdapter();
  return {
    async dispatch(input: { title: string; body: string; silent?: boolean }) {
      const result = await adapter.driver.show(input);
      return { sent: true, notificationId: result?.notificationId };
    },
    async playSound(input: PlayNotificationSoundInput) {
      try {
        await adapter.playSound({ eventType: "run-finished", soundId: input.soundId, volume: input.volume });
        return { played: true as const };
      } catch {
        return { played: false as const, reason: "sound-player-unavailable" as const };
      }
    },
    async requestMicrophoneAccess() {
      if (process.platform !== "darwin") return { granted: true };
      const status = systemPreferences.getMediaAccessStatus("microphone");
      return { granted: status === "granted" || (await systemPreferences.askForMediaAccess("microphone")) };
    },
  };
}
