import type { WorkbenchTab } from "../../../domains/workbench/model/types";

export function resolveSelectedTabIdForWorkspace(input: {
  workspaceId: string;
  tabs: WorkbenchTab[];
  selectedTabIdByWorkspaceId: Record<string, string>;
}): string {
  const workspaceTabs = input.tabs.filter((tab) => tab.workspaceId === input.workspaceId);
  const preferredTabId = input.selectedTabIdByWorkspaceId[input.workspaceId];
  if (preferredTabId && workspaceTabs.some((tab) => tab.id === preferredTabId)) {
    return preferredTabId;
  }
  return workspaceTabs[0]?.id ?? "";
}
