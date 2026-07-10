import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createCliWorkspaceClient } from "./backend/cliWorkspaceClient";
import { registerWorkspaceTools } from "./tools/registerWorkspaceTools";

/**
 * Registers Pi workspace integration for Yishan-backed sessions.
 */
export function createPiWorkspaceExtension(pi: ExtensionAPI): void {
  const workspaceClient = createCliWorkspaceClient();
  registerWorkspaceTools(pi, workspaceClient);
}
