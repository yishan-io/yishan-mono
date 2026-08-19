import { getDesktopHostBridge } from "../rpc/rpcTransport";

/** Writes text to the system clipboard via the main process (works in file:// contexts). */
export async function writeClipboardText(text: string): Promise<void> {
  await getDesktopHostBridge().writeClipboardText(text);
}

/**
 * Copies text to the system clipboard via the Electron main process.
 *
 * Uses IPC instead of navigator.clipboard so it works in file:// contexts
 * (production builds) where the Clipboard API is unavailable.
 *
 * @example
 * ```ts
 * await copyToClipboard(filePath);
 * ```
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await writeClipboardText(text);
  } catch (error) {
    console.error("Failed to copy to clipboard", error);
  }
}
