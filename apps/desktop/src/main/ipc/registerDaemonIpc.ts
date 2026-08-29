import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";
import type { DaemonLogSource } from "../bridge/daemon";

type DaemonIpcOperations = {
  getInfo(): Promise<unknown>;
  restart(): Promise<unknown>;
  readLog(source: DaemonLogSource): Promise<unknown>;
  getQuitOnExit(): Promise<boolean>;
  setQuitOnExit(value: boolean): Promise<unknown>;
};

/** Registers transport for renderer-facing daemon operations. */
export function registerDaemonIpc(operations: DaemonIpcOperations): void {
  ipcMain.handle(desktopHostChannels.getDaemonInfo, () => operations.getInfo());
  ipcMain.handle(desktopHostChannels.restartDaemon, () => operations.restart());
  ipcMain.handle(desktopHostChannels.readDaemonLog, (_event, source: unknown) => {
    if (source !== "system" && source !== "account") {
      return { ok: false, error: "Unknown daemon log source." };
    }
    return operations.readLog(source);
  });
  ipcMain.handle(desktopHostChannels.getDaemonQuitOnExit, () => operations.getQuitOnExit());
  ipcMain.handle(desktopHostChannels.setDaemonQuitOnExit, (_event, value: boolean) => operations.setQuitOnExit(value));
}
