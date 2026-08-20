import { shell } from "electron";
import type { OpenExternalUrlResult } from "../bridge/files";
const allowedProtocols = new Set(["http:", "https:", "mailto:"]);
/** Opens one validated external URL. */
export async function openExternalUrl(url: string): Promise<OpenExternalUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { opened: false, reason: "invalid-url" };
  }
  if (!allowedProtocols.has(parsed.protocol)) return { opened: false, reason: "unsupported-protocol" };
  try {
    await shell.openExternal(parsed.toString());
    return { opened: true };
  } catch {
    return { opened: false, reason: "open-failed" };
  }
}
