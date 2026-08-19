import { getDesktopHostBridge } from "@renderer/platform/hostBridge";
import type { AppendBrowserHistoryInput, BrowserHistoryGroup } from "../../../../main/ipc";

/**
 * Browser host commands — external I/O for the Workbench browser surface.
 *
 * Owned by the Workbench Domain (Domains plan D7). These are Electron-host
 * interactions (open external URL, persist browser history) that serve the
 * Workbench browser tab surface. They were previously App commands; the
 * browser surface belongs to Workbench, so its host I/O lives here.
 */

/** Opens one URL through the Electron main-process host bridge. */
export async function openExternalUrl(url: string) {
  return await getDesktopHostBridge().openExternalUrl({ url });
}

/** Loads persisted browser history groups from the Electron host. */
export async function loadBrowserHistory(): Promise<BrowserHistoryGroup[]> {
  return await getDesktopHostBridge().loadBrowserHistory();
}

/** Appends one browser history entry through the Electron host. */
export async function appendBrowserHistory(input: AppendBrowserHistoryInput): Promise<{ ok: true }> {
  return await getDesktopHostBridge().appendBrowserHistory(input);
}

export type { AppendBrowserHistoryInput, BrowserHistoryGroup } from "../../../../main/ipc";
