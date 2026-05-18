import type { WorkspaceTab } from "../types";

export type WorkspaceTabStateSlice = {
  tabs: WorkspaceTab[];
  selectedWorkspaceId: string;
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};
