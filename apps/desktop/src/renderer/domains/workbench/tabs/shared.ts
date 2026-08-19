import type { OpenTabInput, WorkbenchTab } from "./types";

/** Returns a tab in the target workspace that matches the open request identity. */
export function findExistingTab(
  tabs: WorkbenchTab[],
  input: OpenTabInput,
  targetWorkspaceId: string,
): WorkbenchTab | undefined {
  if (input.kind === "diff") {
    return tabs.find(
      (tab) => tab.workspaceId === targetWorkspaceId && tab.kind === "diff" && tab.data.path === input.path,
    );
  }

  if (input.kind === "file") {
    return tabs.find(
      (tab) => tab.workspaceId === targetWorkspaceId && tab.kind === "file" && tab.data.path === input.path,
    );
  }

  if (input.kind === "image") {
    return tabs.find(
      (tab) => tab.workspaceId === targetWorkspaceId && tab.kind === "image" && tab.data.path === input.path,
    );
  }

  if (input.kind === "video") {
    return tabs.find(
      (tab) => tab.workspaceId === targetWorkspaceId && tab.kind === "video" && tab.data.path === input.path,
    );
  }

  if (input.kind === "audio") {
    return tabs.find(
      (tab) => tab.workspaceId === targetWorkspaceId && tab.kind === "audio" && tab.data.path === input.path,
    );
  }

  if (input.kind === "browser") {
    if (input.reuseExisting === false) {
      return undefined;
    }
    return tabs.find(
      (tab) => tab.workspaceId === targetWorkspaceId && tab.kind === "browser" && tab.data.url === input.url,
    );
  }

  // Agent chat tabs: a history session is one conversation — reopening it
  // focuses the tab that already owns it instead of creating a duplicate tab
  // that races the same session id. Fresh chats (no sessionId) are always new;
  // subagent-detail tabs dedupe within their own view kind.
  if (input.kind === "agent-chat") {
    const sessionId = input.sessionId?.trim();
    if (!sessionId) {
      return undefined;
    }

    const isSubagentDetail = input.sessionView === "subagent-detail";
    return tabs.find(
      (tab) =>
        tab.workspaceId === targetWorkspaceId &&
        tab.kind === "agent-chat" &&
        tab.data.sessionId?.trim() === sessionId &&
        Boolean(tab.data.sessionView === "subagent-detail") === isSubagentDetail,
    );
  }

  if (input.reuseExisting === false) {
    return undefined;
  }

  return tabs.find(
    (tab) =>
      tab.workspaceId === targetWorkspaceId &&
      tab.kind === "terminal" &&
      tab.title === (input.title?.trim() || "Terminal"),
  );
}
