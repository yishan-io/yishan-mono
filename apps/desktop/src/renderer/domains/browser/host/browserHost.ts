import { getDesktopHostBridge } from "@renderer/platform/hostBridge";
import type { AppendBrowserHistoryInput, BrowserHistoryGroup } from "../../../../main/bridge/browser";

/**
 * Browser host boundary — Electron-host I/O for the browser tab surface.
 *
 * A host adapter, not a Command: each function forwards one call to the
 * Electron host bridge so Features never touch the raw transport
 * (desktop-domain-rules). They were previously App commands; the browser
 * surface owns its host I/O here.
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

export type { AppendBrowserHistoryInput, BrowserHistoryGroup } from "../../../../main/bridge/browser";
