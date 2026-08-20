import { shell } from "electron";
/** Opens a directory or reveals a file in the host file manager. */
export async function openInFileManager(path: string, isDirectory: boolean): Promise<void> {
  if (!isDirectory) {
    shell.showItemInFolder(path);
    return;
  }
  const error = await shell.openPath(path);
  if (error) throw new Error(error);
}
