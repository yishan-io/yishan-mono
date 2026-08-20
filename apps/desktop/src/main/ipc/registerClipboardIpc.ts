import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type ClipboardIpcOperations = {
  readExternalFiles(): Promise<unknown>;
  writeText(text: string): unknown;
};

/** Registers transport for system clipboard operations. */
export function registerClipboardIpc(operations: ClipboardIpcOperations): void {
  ipcMain.handle(desktopHostChannels.readExternalClipboardSourcePaths, () => operations.readExternalFiles());
  ipcMain.handle(desktopHostChannels.writeClipboardText, (_event, text) => operations.writeText(text));
}
