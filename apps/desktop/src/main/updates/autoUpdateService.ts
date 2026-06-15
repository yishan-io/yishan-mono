import { resolve } from "node:path";
import type { App } from "electron";
import { autoUpdater } from "electron-updater";
import type { DesktopUpdateEventPayload } from "../ipc";
import { isDevMode } from "../runtime/environment";

type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  forceDevUpdateConfig?: boolean;
  updateConfigPath?: string;
  allowDowngrade?: boolean;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  once: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

type AutoUpdateLogger = Pick<Console, "info" | "warn">;

export type AutoUpdateStartResult = { enabled: true } | { enabled: false; reason: "development" | "unpackaged" };

/** Production builds check once at launch, then every 15 minutes. Override with checkIntervalMs in tests. */
export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

type StartAutoUpdatesInput = {
  app: Pick<App, "isPackaged">;
  updater?: AutoUpdaterLike;
  devMode?: boolean;
  allowDevUpdates?: boolean;
  logger?: AutoUpdateLogger;
  notifyUpdateEvent?: (payload: DesktopUpdateEventPayload) => void;
  checkIntervalMs?: number;
};

function readBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveAllowDevUpdates(input?: boolean): boolean {
  if (typeof input === "boolean") {
    return input;
  }

  return readBooleanEnv(process.env.YISHAN_DESKTOP_ENABLE_UPDATES_IN_DEV);
}

function resolveDevUpdateConfigPath(): string {
  return resolve(process.cwd(), "dev-app-update.yml");
}

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
  allowDevUpdates,
  logger = console,
  notifyUpdateEvent,
  checkIntervalMs = DEFAULT_UPDATE_CHECK_INTERVAL_MS,
}: StartAutoUpdatesInput): AutoUpdateStartResult {
  const updater = inputUpdater ?? (autoUpdater as unknown as AutoUpdaterLike);
  const shouldAllowDevUpdates = resolveAllowDevUpdates(allowDevUpdates);
  let availableVersion: string | undefined;

  if (devMode && !shouldAllowDevUpdates) {
    return { enabled: false, reason: "development" };
  }

  if (!app.isPackaged && !shouldAllowDevUpdates) {
    return { enabled: false, reason: "unpackaged" };
  }

  if (shouldAllowDevUpdates) {
    updater.forceDevUpdateConfig = true;
    updater.updateConfigPath = resolveDevUpdateConfigPath();
    updater.allowDowngrade = true;
  }

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;

  updater.on("checking-for-update", () => {
    logger.info("Checking for desktop app updates");
  });
  updater.on("update-available", (info) => {
    availableVersion = readUpdateVersion(info);
    logger.info("Desktop app update available; waiting for user download confirmation");
    notifyUpdateEvent?.({ status: "available", source: "auto", version: availableVersion });
  });
  updater.on("update-not-available", () => {
    logger.info("Desktop app is up to date");
  });
  updater.on("download-progress", (progress) => {
    notifyUpdateEvent?.({ ...readDownloadProgress(progress), version: availableVersion });
  });
  updater.on("update-downloaded", (info) => {
    availableVersion = readUpdateVersion(info) ?? availableVersion;
    logger.info("Desktop app update downloaded; waiting for user restart confirmation");
    notifyUpdateEvent?.({ status: "downloaded", version: availableVersion });
  });
  updater.on("error", (error) => {
    logger.warn("Desktop app update check failed", error);
  });

  void updater.checkForUpdates().catch((error: unknown) => {
    logger.warn("Failed to start desktop app update check", error);
  });

  const interval = Math.max(1, checkIntervalMs);
  setInterval(() => {
    void updater.checkForUpdates().catch((error: unknown) => {
      logger.warn("Scheduled desktop app update check failed", error);
    });
  }, interval).unref?.();

  return { enabled: true };
}

function readNumber(input: unknown, key: string): number | undefined {
  if (!input || typeof input !== "object" || !(key in input)) {
    return undefined;
  }

  const value = (input as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readDownloadProgress(input: unknown): Extract<DesktopUpdateEventPayload, { status: "downloading" }> {
  return {
    status: "downloading",
    percent: readNumber(input, "percent"),
    transferred: readNumber(input, "transferred"),
    total: readNumber(input, "total"),
    bytesPerSecond: readNumber(input, "bytesPerSecond"),
  };
}

export async function downloadUpdate({
  updater: inputUpdater,
}: {
  updater?: AutoUpdaterLike;
} = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const updater = inputUpdater ?? (autoUpdater as unknown as AutoUpdaterLike);

  try {
    await updater.downloadUpdate();
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to download update" };
  }
}

export type ManualUpdateCheckResult =
  | { status: "update-available"; version?: string }
  | { status: "up-to-date" }
  | { status: "error"; message: string }
  | { status: "not-available"; reason: "development" | "unpackaged" };

type CheckForUpdatesManuallyInput = {
  app: Pick<App, "isPackaged">;
  updater?: AutoUpdaterLike;
  devMode?: boolean;
  allowDevUpdates?: boolean;
  logger?: AutoUpdateLogger;
};

/** Performs a one-shot manual update check and returns the outcome. */
export async function checkForUpdatesManually({
  app,
  updater: inputUpdater,
  devMode = isDevMode(),
  allowDevUpdates,
  logger = console,
}: CheckForUpdatesManuallyInput): Promise<ManualUpdateCheckResult> {
  const shouldAllowDevUpdates = resolveAllowDevUpdates(allowDevUpdates);

  if (devMode && !shouldAllowDevUpdates) {
    return { status: "not-available", reason: "development" };
  }

  if (!app.isPackaged && !shouldAllowDevUpdates) {
    return { status: "not-available", reason: "unpackaged" };
  }

  const updater = inputUpdater ?? (autoUpdater as unknown as AutoUpdaterLike);
  if (shouldAllowDevUpdates) {
    updater.forceDevUpdateConfig = true;
    updater.updateConfigPath = resolveDevUpdateConfigPath();
    updater.allowDowngrade = true;
  }

  return new Promise<ManualUpdateCheckResult>((resolve) => {
    let settled = false;

    const settle = (result: ManualUpdateCheckResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onUpdateAvailable = (info: unknown) => {
      const version = readUpdateVersion(info);
      logger.info("Manual update check: update available", version);
      settle({ status: "update-available", version });
    };

    const onUpdateNotAvailable = () => {
      logger.info("Manual update check: already up to date");
      settle({ status: "up-to-date" });
    };

    const onError = (error: unknown) => {
      const message = error instanceof Error ? error.message : "Update check failed";
      logger.warn("Manual update check failed", error);
      settle({ status: "error", message });
    };

    const cleanup = () => {
      updater.removeListener("update-available", onUpdateAvailable);
      updater.removeListener("update-not-available", onUpdateNotAvailable);
      updater.removeListener("error", onError);
    };

    updater.once("update-available", onUpdateAvailable);
    updater.once("update-not-available", onUpdateNotAvailable);
    updater.once("error", onError);

    updater.checkForUpdates().catch((error: unknown) => {
      settle({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to check for updates",
      });
    });
  });
}
