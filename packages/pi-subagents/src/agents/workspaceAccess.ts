import type { WorkspaceAccess } from "./types";

export const WRITE_CAPABLE_TOOL_NAMES = new Set(["write", "edit", "bash", "apply_patch"]);

/** Returns whether any declared tool can mutate workspace state. */
export function hasWriteCapableTools(tools: string[] | undefined): boolean {
  if (!tools || tools.length === 0) {
    return true;
  }

  return tools.some((toolName) => WRITE_CAPABLE_TOOL_NAMES.has(toolName));
}

/** Resolves conservative workspace access from the declared tool set. */
export function resolveWorkspaceAccessFromTools(tools: string[] | undefined): WorkspaceAccess {
  return hasWriteCapableTools(tools) ? "write" : "read";
}
