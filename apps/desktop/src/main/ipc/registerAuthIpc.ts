import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type AuthIpcOperations = {
  getStatus(): Promise<unknown>;
  login(): Promise<unknown>;
};

/** Registers transport for desktop authentication operations. */
export function registerAuthIpc(operations: AuthIpcOperations): void {
  ipcMain.handle(desktopHostChannels.getAuthStatus, () => operations.getStatus());
  ipcMain.handle(desktopHostChannels.login, () => operations.login());
}
