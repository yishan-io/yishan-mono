import { writeClipboardText } from "../commands/fileCommands";

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
