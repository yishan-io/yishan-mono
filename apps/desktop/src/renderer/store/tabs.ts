import type { WorkspaceTab } from "./types";

export function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

export function resolveSelectedTabIdForWorkspace(input: {
  workspaceId: string;
  tabs: WorkspaceTab[];
  selectedTabIdByWorkspaceId: Record<string, string>;
}): string {
  const workspaceTabs = input.tabs.filter((tab) => tab.workspaceId === input.workspaceId);
  const preferredTabId = input.selectedTabIdByWorkspaceId[input.workspaceId];
  if (preferredTabId && workspaceTabs.some((tab) => tab.id === preferredTabId)) {
    return preferredTabId;
  }
  return workspaceTabs[0]?.id ?? "";
}

/** @deprecated Import `buildTabDataByInput` from `./tabs/open` instead. */
export { buildTabDataByInput } from "./tabs/open";
