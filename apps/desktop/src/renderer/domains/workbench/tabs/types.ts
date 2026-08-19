import type { WorkbenchTab } from "../types";

export type TabStoreStateSlice = {
  tabs: WorkbenchTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};
