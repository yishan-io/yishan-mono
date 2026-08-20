import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type NotificationIpcOperations = {
  dispatch(input: { title: string; body: string; silent?: boolean }): Promise<unknown>;
  playSound(input: { soundId?: string; volume?: number }): Promise<unknown>;
  requestMicrophoneAccess(): Promise<unknown>;
};

/** Registers transport for desktop notification operations. */
export function registerNotificationIpc(operations: NotificationIpcOperations): void {
  ipcMain.handle(desktopHostChannels.dispatchNotification, (_event, input) => operations.dispatch(input));
  ipcMain.handle(desktopHostChannels.playNotificationSound, (_event, input) => operations.playSound(input));
  ipcMain.handle(desktopHostChannels.requestMicrophoneAccess, () => operations.requestMicrophoneAccess());
}
