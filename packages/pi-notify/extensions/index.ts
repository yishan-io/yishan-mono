import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPiNotifyExtension } from "../src/extension";

/**
 * Pi package extension entrypoint.
 */
export default function registerPiNotifyExtension(pi: ExtensionAPI): void {
  createPiNotifyExtension(pi);
}
