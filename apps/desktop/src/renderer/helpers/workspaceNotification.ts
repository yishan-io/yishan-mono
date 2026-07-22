import type { WorkspaceAgentStatus, WorkspaceUnreadTone } from "../store/chatStore";

/** The display state selected from a workspace's runtime and unread notification state. */
export type WorkspaceNotificationTone = "none" | "waiting_input" | "done" | "failed";

/** The theme color token used to render a workspace notification tone. */
export type WorkspaceNotificationColor = "warning.main" | "error.main" | "success.main" | "text.secondary";

/** Resolves the notification tone with waiting-for-input taking precedence over unread activity. */
export function resolveWorkspaceNotificationTone(input: {
  runtimeStatus: WorkspaceAgentStatus;
  unreadTone?: WorkspaceUnreadTone;
}): WorkspaceNotificationTone {
  if (input.runtimeStatus === "waiting_input") {
    return "waiting_input";
  }

  if (input.unreadTone === "error") {
    return "failed";
  }

  if (input.unreadTone === "success") {
    return "done";
  }

  return "none";
}

/** Maps a workspace notification tone to its theme color token. */
export function resolveWorkspaceNotificationColor(tone: WorkspaceNotificationTone): WorkspaceNotificationColor {
  if (tone === "waiting_input") {
    return "warning.main";
  }

  if (tone === "failed") {
    return "error.main";
  }

  if (tone === "done") {
    return "success.main";
  }

  return "text.secondary";
}
