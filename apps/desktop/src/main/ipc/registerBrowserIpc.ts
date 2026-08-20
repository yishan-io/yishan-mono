import { ipcMain } from "electron";
import { desktopHostChannels } from "../bridge/channels";

type BrowserIpcOperations = {
  load(): Promise<unknown>;
  append(entry: unknown): Promise<void>;
};

/** Registers transport for browser history operations. */
export function registerBrowserIpc(operations: BrowserIpcOperations): void {
  ipcMain.handle(desktopHostChannels.loadBrowserHistory, () => operations.load());
  ipcMain.handle(desktopHostChannels.appendBrowserHistory, async (_event, input) => {
    await operations.append(input?.entry);
    return { ok: true as const };
  });
}
