import {
  copyFile as copyFileAsync,
  cp as cpAsync,
  mkdir as mkdirAsync,
  stat as statAsync,
  writeFile as writeFileAsync,
} from "node:fs/promises";
import { statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { clipboard, ipcMain } from "electron";
import { getErrorMessage } from "../../shared/helpers/errorHelpers";
import { launchPath, openExternalUrl } from "../integrations/externalAppLauncher";
import { readExternalClipboardSourcePathsFromSystem } from "../integrations/externalClipboardPipeline";
import { HOST_IPC_CHANNELS } from "../ipc";

/**
 * Registers IPC handlers for file system operations: open in external app,
 * clipboard, file copy, and file write.
 */
export function registerFileIpcHandlers() {
  ipcMain.handle(HOST_IPC_CHANNELS.openEntryInExternalApp, async (_event, input) => {
    const absolutePath = resolve(input.workspaceWorktreePath, input.relativePath ?? ".");
    if (input.appId === "system-file-manager") {
      let isDirectory = true;
      try {
        isDirectory = statSync(absolutePath).isDirectory();
      } catch {
        isDirectory = true;
      }

      await launchPath({
        kind: "system-file-manager",
        path: absolutePath,
        isDirectory,
      });
    } else {
      await launchPath({
        kind: "external-app",
        path: absolutePath,
        appId: input.appId,
      });
    }

    return { ok: true };
  });

  ipcMain.handle(HOST_IPC_CHANNELS.openExternalUrl, async (_event, input) => {
    return await openExternalUrl(input.url);
  });

  ipcMain.handle(HOST_IPC_CHANNELS.readExternalClipboardSourcePaths, async () => {
    return await readExternalClipboardSourcePathsFromSystem();
  });

  ipcMain.handle(HOST_IPC_CHANNELS.writeClipboardText, (_event, text: string) => {
    clipboard.writeText(String(text ?? ""));
    return { ok: true as const };
  });

  ipcMain.handle(HOST_IPC_CHANNELS.copyFiles, async (_event, input) => {
    try {
      const sourcePaths: string[] = Array.isArray(input?.sourcePaths) ? input.sourcePaths : [];
      const destinationDirectory = String(input?.destinationDirectory ?? "");
      if (sourcePaths.length === 0) {
        return { ok: false, error: "sourcePaths is required" };
      }
      if (!destinationDirectory) {
        return { ok: false, error: "destinationDirectory is required" };
      }

      // Ensure destination directory exists
      await mkdirAsync(destinationDirectory, { recursive: true });

      const copiedPaths: string[] = [];
      for (const sourcePath of sourcePaths) {
        const name = basename(sourcePath);
        const destPath = join(destinationDirectory, name);
        const stat = await statAsync(sourcePath);
        if (stat.isDirectory()) {
          await cpAsync(sourcePath, destPath, { recursive: true });
        } else {
          await copyFileAsync(sourcePath, destPath);
        }
        copiedPaths.push(destPath);
      }

      return { ok: true, copiedPaths };
    } catch (error) {
      return { ok: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle(HOST_IPC_CHANNELS.writeFileBase64, async (_event, input) => {
    try {
      const absolutePath = String(input?.absolutePath ?? "");
      const contentBase64 = String(input?.contentBase64 ?? "");
      if (!absolutePath) {
        return { ok: false, error: "absolutePath is required" };
      }
      if (!contentBase64) {
        return { ok: false, error: "contentBase64 is required" };
      }

      // Ensure parent directory exists
      const parentDir = join(absolutePath, "..");
      await mkdirAsync(parentDir, { recursive: true });

      const buffer = Buffer.from(contentBase64, "base64");
      await writeFileAsync(absolutePath, buffer);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getErrorMessage(error) };
    }
  });
}
