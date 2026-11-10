import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  type LocalTaskToolBackend,
  createBackendResolver,
  registerTaskReadTool,
  registerTaskTools,
} from "./tools/registerTaskTools";

/** Registers Yishan daemon-backed task tools, optionally with a test backend. */
export function createPiTaskExtension(pi: ExtensionAPI, backend?: LocalTaskToolBackend): void {
  if (backend) registerTaskTools(pi, backend);
  else registerTaskTools(pi);
}

/** Registers only task_read for isolated sessions; no Task mutation tools are exposed. */
export function createPiTaskReadExtension(pi: ExtensionAPI, backend?: LocalTaskToolBackend): void {
  registerTaskReadTool(pi, createBackendResolver(backend));
}
