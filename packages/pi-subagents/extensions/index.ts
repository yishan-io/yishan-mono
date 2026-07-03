import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPiSubagentsExtension } from "../src";

/**
 * Pi package extension entrypoint.
 */
export default function registerPiSubagentsExtension(pi: ExtensionAPI): void {
  createPiSubagentsExtension(pi);
}
