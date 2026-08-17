import type { WorkspaceTab } from "../../../../store/types";

export type WorkspaceTabStateSlice = {
  tabs: WorkspaceTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};
