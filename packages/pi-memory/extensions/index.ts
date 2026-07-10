import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPiMemoryExtension } from "../src";

/**
 * Pi package extension entrypoint.
 */
export default function registerPiMemoryExtension(pi: ExtensionAPI): void {
  createPiMemoryExtension(pi);
}
