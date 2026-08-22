import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type LocalTaskToolBackend, registerTaskTools } from "./tools/registerTaskTools";

/** Registers Yishan daemon-backed task tools, optionally with a test backend. */
export function createPiTaskExtension(pi: ExtensionAPI, backend?: LocalTaskToolBackend): void {
  if (backend) registerTaskTools(pi, backend);
  else registerTaskTools(pi);
}
