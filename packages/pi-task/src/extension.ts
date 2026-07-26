import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerTaskTools } from "./tools/registerTaskTools";

/** Registers Yishan task-record integration for Pi sessions. */
export function createPiTaskExtension(pi: ExtensionAPI): void {
  registerTaskTools(pi);
}
