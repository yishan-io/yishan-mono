import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

export type AppIpcOperations = {
  getVersion(): string;
};

/** Registers transport for desktop application information. */
export function registerAppIpc(operations: AppIpcOperations): void {
  ipcMain.handle(desktopHostChannels.getDesktopAppVersion, () => operations.getVersion());
}
