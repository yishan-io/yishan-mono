import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPiLspExtension } from "../src";

/**
 * Pi package extension entrypoint.
 */
export default function registerPiLspExtension(pi: ExtensionAPI): void {
  createPiLspExtension(pi);
}
