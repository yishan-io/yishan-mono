import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPiWorkspaceExtension } from "../src";

/**
 * Pi package extension entrypoint.
 */
export default function registerPiWorkspaceExtension(pi: ExtensionAPI): void {
  createPiWorkspaceExtension(pi);
}
