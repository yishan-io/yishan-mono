import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type ExternalAppIpcOperations = {
  openEntry(input: unknown): Promise<unknown>;
  list(): Promise<unknown>;
  openUrl(input: { url: string }): Promise<unknown>;
};

/** Registers transport for external application and URL operations. */
export function registerExternalAppIpc(operations: ExternalAppIpcOperations): void {
  ipcMain.handle(desktopHostChannels.openEntryInExternalApp, (_event, input) => operations.openEntry(input));
  ipcMain.handle(desktopHostChannels.listDetectedExternalAppIds, () => operations.list());
  ipcMain.handle(desktopHostChannels.openExternalUrl, (_event, input) => operations.openUrl(input));
}
