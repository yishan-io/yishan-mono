import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type UpdateIpcOperations = {
  getPendingUpdate(): unknown;
  dismissUpdate(): Promise<void>;
  handleManualUpdateCheck(): Promise<void>;
  download(): Promise<unknown>;
  install(): Promise<unknown>;
};

/** Registers transport for update runtime operations. */
export function registerUpdateIpc(operations: UpdateIpcOperations): void {
  ipcMain.handle(desktopHostChannels.getPendingUpdate, () => operations.getPendingUpdate());
  ipcMain.handle(desktopHostChannels.dismissUpdate, async () => {
    await operations.dismissUpdate();
    return { ok: true as const };
  });
  ipcMain.handle(desktopHostChannels.checkForUpdates, async () => {
    await operations.handleManualUpdateCheck();
    return { ok: true as const };
  });
  ipcMain.handle(desktopHostChannels.downloadUpdate, () => operations.download());
  ipcMain.handle(desktopHostChannels.installUpdate, () => operations.install());
}
