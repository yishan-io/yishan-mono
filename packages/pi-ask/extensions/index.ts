import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPiAskExtension } from "../src/extension";

/**
 * Pi package extension entrypoint.
 */
export default function registerPiAskExtension(pi: ExtensionAPI): void {
  createPiAskExtension(pi);
}
