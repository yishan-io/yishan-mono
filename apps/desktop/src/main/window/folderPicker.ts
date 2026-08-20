import { dialog } from "electron";
/** Opens the native directory selection dialog for the main window when available. */
export async function pickLocalFolder(
  browserWindow: Electron.BrowserWindow | null,
  input?: { startingFolder?: string },
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openDirectory", "createDirectory"],
    defaultPath: input?.startingFolder?.trim() || undefined,
  };
  const selection = browserWindow
    ? await dialog.showOpenDialog(browserWindow, options)
    : await dialog.showOpenDialog(options);
  return selection.canceled ? null : (selection.filePaths[0] ?? null);
}
