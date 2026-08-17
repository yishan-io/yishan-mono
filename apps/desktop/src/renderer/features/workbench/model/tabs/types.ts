import type { WorkspaceTab } from "../../../../features/workbench/model/types";

export type WorkspaceTabStateSlice = {
  tabs: WorkspaceTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};
