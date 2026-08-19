import type { WorkbenchTab } from "../../../../domains/workbench/model/types";

export type TabStoreStateSlice = {
  tabs: WorkbenchTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};
