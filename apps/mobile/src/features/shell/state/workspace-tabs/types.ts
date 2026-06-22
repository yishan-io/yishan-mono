import type { ShellWorkspaceTab } from "@/features/shell/state/shell.types";

export type ShellWorkspaceTabStateSlice = {
  workspaceId: string;
  tabs: ShellWorkspaceTab[];
  selectedTabId: string;
};
