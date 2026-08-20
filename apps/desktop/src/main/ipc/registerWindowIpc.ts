import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type WindowIpcOperations = {
  pickFolder(input?: { startingFolder?: string }): Promise<string | null>;
  toggleMaximized(): void;
  isFullscreen(): boolean;
};

/** Registers transport for main-window operations. */
export function registerWindowIpc(operations: WindowIpcOperations): void {
  ipcMain.handle(desktopHostChannels.openLocalFolderDialog, (_event, input) => operations.pickFolder(input));
  ipcMain.handle(desktopHostChannels.toggleMainWindowMaximized, () => {
    operations.toggleMaximized();
    return { ok: true as const };
  });
  ipcMain.handle(desktopHostChannels.getMainWindowFullscreenState, () => ({
    isFullscreen: operations.isFullscreen(),
  }));
}
