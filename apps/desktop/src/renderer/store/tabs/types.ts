import type { WorkspaceTab } from "../types";

export type WorkspaceTabStateSlice = {
  tabs: WorkspaceTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};
