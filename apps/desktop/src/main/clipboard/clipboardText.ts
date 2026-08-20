import { clipboard } from "electron";
/** Writes text to the system clipboard. */
export function writeClipboardText(text: string) {
  clipboard.writeText(String(text ?? ""));
  return { ok: true as const };
}
