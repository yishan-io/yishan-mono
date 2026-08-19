/**
 * Workspace notification tone + color mapping (desktop8 Phase 30: moved to
 * the Notification UI layer). The cross-Domain tone DECISION lives in
 * `app/selectors.ts`; this module owns the tone/color vocabulary.
 */

/** The display state selected from a workspace's runtime and unread notification state. */
export type WorkspaceNotificationTone = "none" | "waiting_input" | "done" | "failed";

/** The theme color token used to render a workspace notification tone. */
export type WorkspaceNotificationColor = "warning.main" | "error.main" | "success.main" | "text.secondary";

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
