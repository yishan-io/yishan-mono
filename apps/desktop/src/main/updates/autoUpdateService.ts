import type { App } from "electron";
import { autoUpdater } from "electron-updater";
import type { DesktopUpdateEventPayload } from "../ipc";
import { isDevMode } from "../runtime/environment";

type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdatesAndNotify: () => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

type AutoUpdateLogger = Pick<Console, "info" | "warn">;

export type AutoUpdateStartResult = { enabled: true } | { enabled: false; reason: "development" | "unpackaged" };

type StartAutoUpdatesInput = {
  app: Pick<App, "isPackaged">;
  updater?: AutoUpdaterLike;
  devMode?: boolean;
  logger?: AutoUpdateLogger;
  notifyUpdateReady?: (payload: DesktopUpdateEventPayload) => void;
};

function readUpdateVersion(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("version" in input)) {
    return undefined;
  }

  const version = (input as { version?: unknown }).version;
  return typeof version === "string" && version.trim() ? version : undefined;
}

/** Starts packaged-app update checks without interrupting local development sessions. */
export function startAutoUpdates({
  app,
  updater: inputUpdater,
  devMode = isDevMode(),
  logger = console,
  notifyUpdateReady,
}: StartAutoUpdatesInput): AutoUpdateStartResult {
  const updater = inputUpdater ?? (autoUpdater as unknown as AutoUpdaterLike);
  let availableVersion: string | undefined;

  if (devMode) {
    return { enabled: false, reason: "development" };
  }

  if (!app.isPackaged) {
    return { enabled: false, reason: "unpackaged" };
  }

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on("checking-for-update", () => {
    logger.info("Checking for desktop app updates");
  });
  updater.on("update-available", (info) => {
    availableVersion = readUpdateVersion(info);
    logger.info("Desktop app update available; downloading in background");
  });
  updater.on("update-not-available", () => {
    logger.info("Desktop app is up to date");
  });
  updater.on("update-downloaded", (info) => {
    availableVersion = readUpdateVersion(info) ?? availableVersion;
    logger.info("Desktop app update downloaded; it will install when the app quits");
    notifyUpdateReady?.({ version: availableVersion });
  });
  updater.on("error", (error) => {
    logger.warn("Desktop app update check failed", error);
  });

  void updater.checkForUpdatesAndNotify().catch((error: unknown) => {
    logger.warn("Failed to start desktop app update check", error);
  });

  return { enabled: true };
}
