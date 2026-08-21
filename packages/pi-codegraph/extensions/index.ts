import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPiCodeGraphExtension } from "../src";

/** Registers the CodeGraph Pi package extension entrypoint. */
export default function registerPiCodeGraphExtension(pi: ExtensionAPI): void {
  createPiCodeGraphExtension(pi);
}
