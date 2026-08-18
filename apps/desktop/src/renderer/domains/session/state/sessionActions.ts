import type { SessionOrganization, SessionUser } from "./sessionStore";
import { sessionStore } from "./sessionStore";

/**
 * Session feature state actions — the public state-change surface for session
 * State (Phase 12, desktop5.md). Cross-feature commands apply session state
 * changes through these functions instead of importing the session Store.
 */
export function setSelectedOrganizationId(organizationId: string): void {
  sessionStore.getState().setSelectedOrganizationId(organizationId);
}

/** Replaces the session data snapshot (user, organizations, selection). */
export function setSessionData(input: {
  currentUser: SessionUser | null;
  organizations: SessionOrganization[];
  selectedOrganizationId?: string;
}): void {
  sessionStore.getState().setSessionData(input);
}

export function setOrganizationVoiceUsage(
  organizationId: string,
  usage: NonNullable<SessionOrganization["voiceUsage"]>,
): void {
  sessionStore.getState().setOrganizationVoiceUsage(organizationId, usage);
}

/** Updates the current user's notification preferences in session state. */
export function updateCurrentUserNotificationPreferences(preferences: SessionUser["notificationPreferences"]): void {
  const state = sessionStore.getState();
  if (state.currentUser) {
    state.setSessionData({
      currentUser: {
        ...state.currentUser,
        notificationPreferences: preferences,
      },
      organizations: state.organizations,
      selectedOrganizationId: state.selectedOrganizationId,
    });
  }
}
