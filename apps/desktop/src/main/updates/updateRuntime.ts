import type { App, MenuItemConstructorOptions, WebContents } from "electron";
import { Menu } from "electron";
import { DESKTOP_RPC_IPC_CHANNELS } from "../bridge/channels";
import type { DesktopUpdateEventPayload } from "../bridge/updates";
import { resolveLocalCalendarDate, shouldSuppressAutoUpdateEvent } from "./autoUpdateDismissalState";
import { checkForUpdatesManually, downloadUpdate, startAutoUpdates } from "./autoUpdateService";

export type UpdateRuntimeOptions = {
  /** Sends one desktop-rpc event envelope to the renderer (main window webContents). */
  sendEvent: (payload: Record<string, unknown>) => void;
  /** Brings the app window forward (menu actions). */
  focusApp: () => void;
};

/**
 * UpdateRuntime — one owner for the desktop update lifecycle: pending update
 * state, event dispatch to the renderer, manual check/download/install flows,
 * dismissal suppression, and the native menu "Check for Updates" item state.
 * The electron-updater poller mechanics live in autoUpdateService.
 */
export class UpdateRuntime {
  private pendingUpdateReady: DesktopUpdateEventPayload | null = null;
  private dismissedAutoUpdateDate: string | null = null;

  constructor(
    private readonly app: App,
    private readonly options: UpdateRuntimeOptions,
  ) {}

  /** Starts the auto-update poller; update events route through dispatchUpdateEvent. */
  startAutoUpdates(): void {
    startAutoUpdates({
      app: this.app,
      notifyUpdateEvent: (payload) => this.dispatchUpdateEvent(payload),
    });
  }

  /** Returns the currently pending update payload, if any. */
  getPendingUpdate(): DesktopUpdateEventPayload | null {
    return this.pendingUpdateReady;
  }

  private dispatchUpdateEvent(payload: DesktopUpdateEventPayload): void {
    if (shouldSuppressAutoUpdateEvent(payload, this.dismissedAutoUpdateDate)) {
      this.pendingUpdateReady = null;
      return;
    }

    this.pendingUpdateReady = payload.status === "not-available" || payload.status === "error" ? null : payload;
    this.options.sendEvent({
      method: "desktopUpdate",
      payload,
    });
  }

  /** Dismisses the current update prompt and records same-day auto-update suppression when needed. */
  async dismissUpdate(): Promise<void> {
    const pendingUpdate = this.pendingUpdateReady;
    this.pendingUpdateReady = null;

    if (pendingUpdate?.status !== "available" || pendingUpdate.source !== "auto") {
      return;
    }

    this.dismissedAutoUpdateDate = resolveLocalCalendarDate();
  }

  /** Handles a manual "Check for Updates" request from the native menu. */
  async handleManualUpdateCheck(): Promise<void> {
    // Disable the menu item while checking to provide visual feedback.
    this.setUpdateMenuItemEnabled(false, "Checking for Updates…");
    this.options.focusApp();
    this.dispatchUpdateEvent({ status: "checking", source: "manual" });

    try {
      const result = await checkForUpdatesManually({ app: this.app });

      this.setUpdateMenuItemEnabled(true);

      switch (result.status) {
        case "update-available": {
          this.dispatchUpdateEvent({ status: "available", source: "manual", version: result.version });
          break;
        }
        case "up-to-date": {
          this.dispatchUpdateEvent({ status: "not-available", source: "manual" });
          break;
        }
        case "error": {
          this.dispatchUpdateEvent({ status: "error", source: "manual", message: result.message });
          break;
        }
        case "not-available": {
          const reason =
            result.reason === "development"
              ? "Update checking is not available in development mode."
              : "Update checking is not available for unpackaged builds.";
          this.dispatchUpdateEvent({ status: "error", source: "manual", message: reason });
          break;
        }
      }
    } catch (error: unknown) {
      this.setUpdateMenuItemEnabled(true);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      this.dispatchUpdateEvent({ status: "error", source: "manual", message });
    }
  }

  /** Downloads the pending update; reports errors via dispatchUpdateEvent. */
  async download(): Promise<{ ok: boolean; error?: string }> {
    const result = await downloadUpdate();
    if (!result.ok) {
      this.dispatchUpdateEvent({ status: "error", source: "download", message: result.error });
    }
    return result;
  }

  /** Updates the "Check for Updates" menu item's enabled state and label. */
  setUpdateMenuItemEnabled(enabled: boolean, label = "Check for Updates"): void {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;

    const appMenu = menu.items[0]?.submenu;
    if (!appMenu) return;

    const updateItem = appMenu.items.find(
      (item) => item.label === "Check for Updates" || item.label === "Checking for Updates…",
    ) as MenuItemConstructorOptions | undefined;
    if (updateItem) {
      updateItem.enabled = enabled;
      updateItem.label = label;
    }
  }
}

/** Convenience: send a desktop-rpc event envelope to one webContents. */
export function sendDesktopRpcEvent(webContents: WebContents | null, payload: Record<string, unknown>): void {
  webContents?.send(DESKTOP_RPC_IPC_CHANNELS.event, payload);
}
