import { existsSync } from "node:fs";
import { createElectrobunNotificationDriver } from "./electrobunNotificationDriver";
import { resolveDesktopSoundDirectory } from "./soundDirectory";
import { resolveSoundFilePath } from "./soundMapping";
import { createSoundPlayer } from "./soundRuntime";
export type {
  DesktopNotificationHostAdapter,
  NativeNotificationRequest,
  NativeNotificationResult,
  NotificationClickEvent,
  NotificationDispatchResult,
  NotificationDriver,
  NotificationEvent,
  NotificationEventType,
  NotificationPreferences,
  NotificationServiceOptions,
  NotificationSoundId,
  NotificationSoundPlayer,
  NotificationSoundPreviewResult,
} from "./types";
import type { DesktopNotificationHostAdapter, NotificationServiceOptions, NotificationSoundPlayer } from "./types";

/**
 * Creates desktop host bindings required for app-server notification-service construction.
 */
export function createDesktopNotificationHostAdapter(
  input?: NotificationServiceOptions,
): DesktopNotificationHostAdapter {
  const driver = createElectrobunNotificationDriver();
  const soundDirectoryPath = resolveDesktopSoundDirectory();
  const player = createSoundPlayer();
  const playSound: NotificationSoundPlayer = async ({ soundId, volume }) => {
    const filePath = resolveSoundFilePath({
      soundDirectoryPath,
      soundId,
    });

    if (!existsSync(filePath)) {
      throw new Error(`Notification sound file not found: ${filePath}`);
    }

    await player.play({
      filePath,
      volume,
    });
  };

  return {
    driver,
    playSound,
    onNotificationClickAction: input?.onNotificationClickAction,
  };
}
