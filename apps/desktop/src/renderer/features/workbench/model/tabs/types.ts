import type { WorkbenchTab } from "../../../../features/workbench/model/types";

export type TabStoreStateSlice = {
  tabs: WorkbenchTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};
