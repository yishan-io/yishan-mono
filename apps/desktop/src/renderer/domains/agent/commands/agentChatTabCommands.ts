import { resolveChatFilePath } from "@renderer/domains/files";
import { openTab, openTabInOppositePane, tabStore } from "@renderer/domains/workbench";
import { enqueueWorkspaceErrorNotice } from "@renderer/domains/workspace";
import { renamePiCompatibilitySession } from "../daemon/daemonAgentProcedures";

// ─── Chat-to-file tab bridge (desktop6-adjust.md W5) ───────────────────────
// Opening a file referenced from chat is an Agent workflow: resolve the path
// through the Files feature, then open a Workbench Tab through the public
// Workbench API.

/**
 * Opens one file referenced from chat, resolving it to a real workspace file first.
 *
 * When the referenced path does not exist (agents sometimes emit unreal paths),
 * a best-effort search is attempted; if no unique real file is found the user is
 * notified instead of opening a tab with mock content.
 */
export async function openChatFileTab(input: {
  workspaceId: string;
  relativePath: string;
  oppositePane?: boolean;
}): Promise<void> {
  const resolved = await resolveChatFilePath({ workspaceId: input.workspaceId, relativePath: input.relativePath });
  if (resolved.status === "unavailable") {
    enqueueWorkspaceErrorNotice({
      title: "Unable to open file",
      message: `Could not load ${input.relativePath}. Please try again.`,
    });
    return;
  }
  if (resolved.status === "not-found") {
    enqueueWorkspaceErrorNotice({
      title: "File not found",
      message: `${input.relativePath} does not exist in this workspace.`,
    });
    return;
  }

  const tabInput = {
    kind: "file" as const,
    workspaceId: input.workspaceId,
    path: resolved.path,
    content: resolved.content,
  };
  if (input.oppositePane) {
    openTabInOppositePane(tabInput);
  } else {
    openTab(tabInput);
  }
}

/**
 * Renames the daemon-side pi session that backs one agent-chat tab.
 * Workbench Tab renames stay presentation-only; the session rename side effect
 * belongs to the Agent module (desktop6-adjust.md W6 task 2).
 */
export async function renameAgentChatSessionByTab(tabId: string, title: string): Promise<void> {
  const tab = tabStore.getState().tabs.find((tab) => tab.id === tabId);
  const sessionId = tab?.kind === "agent-chat" ? tab.data.sessionId?.trim() : undefined;
  const runtime = tab?.kind === "agent-chat" ? (tab.data.runtime ?? "pi") : undefined;
  if (!sessionId || runtime !== "pi") {
    return;
  }
  await renamePiCompatibilitySession({ sessionId, title });
}
