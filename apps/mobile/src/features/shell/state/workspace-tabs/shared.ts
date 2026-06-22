import type { OpenShellWorkspaceTabInput, ShellWorkspaceTab } from "@/features/shell/state/shell.types";

/** Returns a tab in the target workspace that matches the open request identity. */
export function findExistingShellWorkspaceTab(
  tabs: ShellWorkspaceTab[],
  input: OpenShellWorkspaceTabInput,
  targetWorkspaceId: string,
): ShellWorkspaceTab | undefined {
  if (input.kind === "diff") {
    return tabs.find(
      (tab) =>
        tab.workspaceId === targetWorkspaceId &&
        tab.kind === "diff" &&
        tab.data.path === input.path &&
        tab.data.changeKind === input.changeKind,
    );
  }

  if (input.kind === "file") {
    return tabs.find(
      (tab) => tab.workspaceId === targetWorkspaceId && tab.kind === "file" && tab.data.path === input.path,
    );
  }

  if (input.reuseExisting === false) {
    return undefined;
  }

  return tabs.find(
    (tab) =>
      tab.workspaceId === targetWorkspaceId && tab.kind === "terminal" && tab.data.terminalId === input.terminalId,
  );
}
