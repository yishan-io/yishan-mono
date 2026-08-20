import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type FileSystemIpcOperations = {
  resolveRealPath(path: string): Promise<unknown>;
  copyFiles(input: unknown): Promise<unknown>;
  writeFileBase64(input: unknown): Promise<unknown>;
};

/** Registers transport for local filesystem operations. */
export function registerFileSystemIpc(operations: FileSystemIpcOperations): void {
  ipcMain.handle(desktopHostChannels.resolveRealPath, (_event, path) => operations.resolveRealPath(path));
  ipcMain.handle(desktopHostChannels.copyFiles, (_event, input) => operations.copyFiles(input));
  ipcMain.handle(desktopHostChannels.writeFileBase64, (_event, input) => operations.writeFileBase64(input));
}
