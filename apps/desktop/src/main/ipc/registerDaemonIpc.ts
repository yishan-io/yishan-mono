import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type DaemonIpcOperations = {
  getInfo(): Promise<unknown>;
  restart(): Promise<unknown>;
  readLog(): Promise<unknown>;
  getQuitOnExit(): Promise<boolean>;
  setQuitOnExit(value: boolean): Promise<unknown>;
};

/** Registers transport for renderer-facing daemon operations. */
export function registerDaemonIpc(operations: DaemonIpcOperations): void {
  ipcMain.handle(desktopHostChannels.getDaemonInfo, () => operations.getInfo());
  ipcMain.handle(desktopHostChannels.restartDaemon, () => operations.restart());
  ipcMain.handle(desktopHostChannels.readDaemonLog, () => operations.readLog());
  ipcMain.handle(desktopHostChannels.getDaemonQuitOnExit, () => operations.getQuitOnExit());
  ipcMain.handle(desktopHostChannels.setDaemonQuitOnExit, (_event, value: boolean) => operations.setQuitOnExit(value));
}
